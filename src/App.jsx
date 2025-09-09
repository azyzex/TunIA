import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import 'bootstrap/dist/css/bootstrap.min.css'
import ChatHeader from './components/ChatHeader'
import ChatMessage from './components/ChatMessage'
import ChatInput from './components/ChatInput'
import WelcomeScreen from './components/WelcomeScreen'
import './App.css'
import AuthScreen from './components/AuthScreen'
import { supabase, ensureProfile, createConversation, addUserMessage, addAIMessage, fetchConversationMessages } from '../supabaseClient'
// PDF.js: bundle worker locally to avoid network fetch issues
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function App() {
  const [user, setUser] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  // Remove showWelcome state since we're skipping the welcome screen
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [editModal, setEditModal] = useState({ open: false, message: null })
  const [retryCount, setRetryCount] = useState({}) // Track retry counts per message
  const [downloadingPdf, setDownloadingPdf] = useState(null) // Track which message PDF is being downloaded
  const [generatingPreview, setGeneratingPreview] = useState(null) // Track which message is generating PDF preview
  const [quizMode, setQuizMode] = useState(false)
  const [quizConfirmingId, setQuizConfirmingId] = useState(null)
  const [quizGenerating, setQuizGenerating] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => { scrollToBottom() }, [messages])

  // Auth session listener
  useEffect(()=>{
    let mounted = true;
    (async()=>{
      const { data:{ session } } = await supabase.auth.getSession();
      if (mounted && session?.user){ setUser(session.user); await ensureProfile(session.user);}    
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session)=>{
      if (session?.user){ setUser(session.user); ensureProfile(session.user);} else { setUser(null); setConversationId(null); setMessages([]);}  
    });
    return ()=>{ mounted=false; sub.subscription.unsubscribe(); };
  },[]);

  // Event listener for quiz regeneration with custom parameters
  useEffect(() => {
    const handleQuizConfirmMessage = (event) => {
      const confirmMsg = event.detail
      setMessages(prev => [...prev, confirmMsg])
      setQuizConfirmingId(confirmMsg.id)
    }

    window.addEventListener('addQuizConfirmMessage', handleQuizConfirmMessage)
    
    return () => {
      window.removeEventListener('addQuizConfirmMessage', handleQuizConfirmMessage)
    }
  }, [])

  const handleExportPdf = async (aiMessage) => {
    try {
      // Find the immediate previous user message
      const idx = messages.findIndex(m => m.id === aiMessage.id)
      let prevUser = ''
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i]?.sender === 'user') { prevUser = messages[i].text || ''; break }
      }
      const res = await fetch('http://localhost:3001/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPrompt: prevUser, aiText: aiMessage.text })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'PDF_ERROR')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'export.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setMessages(prev => [...prev, {
        id: prev.length + 1,
        text: 'تعطلت خدمة إنشاء ال-PDF مؤقتاً. جرّب بعد شوية.',
        sender: 'ai',
        timestamp: new Date()
      }])
    }
  }

  // New handler for the PDF export tool workflow
  const handleDownloadPdf = async (messageId) => {
    setGeneratingPreview(messageId) // Set loading state
    try {
      const response = await fetch('http://localhost:3001/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      })
      
      if (!response.ok) throw new Error('PDF generation failed')
      
      const data = await response.json()
      
      // Create a new AI message showing what will be in the PDF with confirmation button
      const previewMessage = {
        id: Date.now(),
        sender: 'ai',
        text: data.previewContent,
        timestamp: new Date(),
        isPdfPreview: true, // Flag to show confirmation button
        pdfData: messages // Store the data for actual PDF generation
      }
      
      setMessages(prev => [...prev, previewMessage])
    } catch (error) {
      console.error('PDF export error:', error)
      const errorMessage = {
        id: Date.now(),
        sender: 'ai',
        text: 'صارت مشكلة في تجهيز المعاينة للـ PDF. جرّب بعد شوية.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setGeneratingPreview(null) // Clear loading state
    }
  }

  // Handler for confirming PDF download after preview
  const handleConfirmPdfDownload = async (pdfData, messageId, includeCitations = true, exportFormat = 'pdf') => {
    setDownloadingPdf(messageId)
    try {
      const endpoint = exportFormat === 'pdf' ? '/download-pdf' : 
                     exportFormat === 'docx' ? '/download-docx' : 
                     '/download-markdown'
      
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: pdfData, includeCitations })
      })
      
      if (!response.ok) throw new Error(`${exportFormat.toUpperCase()} download failed`)
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      
      // Set appropriate file extension
      const extension = exportFormat === 'pdf' ? '.pdf' : 
                       exportFormat === 'docx' ? '.rtf' : '.md'
      a.download = `chat-export${extension}`
      
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error(`${exportFormat.toUpperCase()} download error:`, error)
      const formatName = exportFormat === 'pdf' ? 'PDF' : 
                        exportFormat === 'docx' ? 'Word (RTF)' : 'Markdown'
      alert(`فشل في تحميل الـ ${formatName}. جرّب مرة ثانية.`)
    } finally {
      setDownloadingPdf(null)
    }
  }

  const startChat = (initialMessage = null) => {
    // Removed setShowWelcome call since we're skipping welcome screen
    
    // Add welcome message from AI
    const welcomeMessage = {
      id: 1,
      text: "أهلاً بيك! شنوة تحبني نعاونك فيه؟",
      sender: 'ai',
      timestamp: new Date(),
      isWelcomeMessage: true // Flag to identify the welcome message
    }
    
    setMessages([welcomeMessage])
    
    // If there's an initial message, send it
    if (initialMessage) {
      setTimeout(() => {
        handleSendMessage({ text: initialMessage })
      }, 500)
    }
  }

  const handleSendMessage = async ({ text, file, webSearch, fetchUrl, image, pdfExport, quizMode: sendQuizMode }) => {
    if (!user) return; // Guard
    if (!text.trim() && !file && !image) return;

    // Ensure conversation
    let convId = conversationId;
    if (!convId){
      try { const conv = await createConversation(user.id, text.slice(0,60)); convId = conv.id; setConversationId(conv.id);} catch(e){ console.error('createConversation', e);} }

    const newMessage = { id: messages.length + 1, text, sender:'user', timestamp:new Date(), file, imagePreview: image?.previewUrl || null };

  // Prepare history: last 30 messages before this one, excluding file
    const history = [...messages].slice(-30).map(msg => ({
      sender: msg.sender,
      text: msg.text
    }));

  setMessages(prev => [...prev, newMessage]);
  // Persist user message
  try { if (convId) await addUserMessage(convId, user.id, text); } catch(e){ console.warn('persist user message failed', e); }
    // If quiz mode is on, show a confirmation message instead of calling the server
    if (sendQuizMode) {
      const confirmMsg = {
        id: Date.now(),
        sender: 'ai',
        text: `تأكيد: تحب نعملك اختبار (أسئلة متعددة الاختيارات) على: "${text}"؟` ,
        timestamp: new Date(),
        isQuizConfirm: true,
        quizSubject: text,
        quizDefaultQuestions: 5,
        quizDefaultAnswers: 4
      }
      setMessages(prev => [...prev, confirmMsg])
      setQuizConfirmingId(confirmMsg.id)
      return
    }

    setIsLoading(true);

    try {
      let pdfText = '';
      if (file) {
        // Read PDF file as text using PDF.js
        pdfText = await readPDFFile(file);
      }
      console.log('Sending to server:', {
        messageLen: text?.length || 0,
        historyCount: history.length,
        hasFile: Boolean(file),
        pdfLen: pdfText?.length || 0,
        pdfExport: Boolean(pdfExport)
      });
      // Always enable web search and URL fetch. Also, append today's date hint to the text for time-sensitive queries.
      const today = new Date();
      const todayStr = today.toLocaleDateString('en-CA'); // YYYY-MM-DD
      const stampedText = `${text}\n\n(Reference date: ${todayStr})`;
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: stampedText, 
          history, 
          pdfText, 
          webSearch: true, 
          fetchUrl: true, 
          image, 
          pdfExport 
        })
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Server error response:', data);
        // Force a generic failure path
        throw new Error('SERVICE_ERROR');
      }
      let aiResponse;
      if (data.isQuiz && Array.isArray(data.quiz)) {
        aiResponse = {
          id: messages.length + 2,
          text: 'اختبار قصير على الموضوع إلي طلبت عليه:',
          sender: 'ai',
          timestamp: new Date(),
          isQuiz: true,
          quiz: data.quiz,
        };
      } else {
        aiResponse = {
          id: messages.length + 2,
          text: data.reply || 'صارّت مشكلة مؤقتة في الخدمة، جرّب بعد شوية.',
          sender: 'ai',
          timestamp: new Date(),
          isPdfExport: data.isPdfExport || false,
          pdfContent: data.pdfContent || null
        };
      }
  setMessages(prev => [...prev, aiResponse]);
  // Persist AI message
  try { if (convId) await addAIMessage(convId, aiResponse.text, { isPdfExport: aiResponse.isPdfExport }); } catch(e){ console.warn('persist ai message failed', e); }
    } catch (err) {
      console.error('Fetch/chat error:', err);
      const friendly = 'صارت مشكلة تقنية مؤقتة في الخدمة. جرّب بعد شوية ولا تأكّد إلي الخادم شغّال.';
      setMessages(prev => [...prev, {
        id: messages.length + 2,
        text: friendly,
        sender: 'ai',
        timestamp: new Date()
      }]);
    }
    setIsLoading(false);
  }

// Helper to read PDF file as text using PDF.js
async function readPDFFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const typedarray = new Uint8Array(e.target.result);
        const pdf = await getDocument(typedarray).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ');
        }
        if (text.length > 10000) text = text.slice(0, 10000);
        resolve(text);
      } catch (err) {
        console.error('PDF parsing error:', err);
        reject(err);
      }
    };
    reader.onerror = function(e) {
      console.error('FileReader error:', e);
      reject(e);
    };
    reader.readAsArrayBuffer(file);
  });
}


  // Quiz confirm handlers
  const handleConfirmQuiz = async ({ subject, questions, answers, difficulties = ['medium'], types = ['mcq'], timer = null, hints = false, immediateFeedback = false, messageId }) => {
    setQuizGenerating(true)
    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: subject,
          history: messages.slice(-30).map(m => ({ sender: m.sender, text: m.text })),
          quizMode: true,
          quizQuestions: questions,
          quizOptions: answers,
          quizDifficulties: difficulties,
          quizTypes: types,
          quizTimer: timer,
          quizHints: hints,
          quizImmediateFeedback: immediateFeedback,
          webSearch: true,
          fetchUrl: true
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error('QUIZ_ERROR')
      const quizMessage = {
        id: Date.now(),
        sender: 'ai',
        text: timer ? `اختبار قصير على الموضوع إلي طلبت عليه (المدة: ${timer} دقيقة):` : 'اختبار قصير على الموضوع إلي طلبت عليه:',
        timestamp: new Date(),
        isQuiz: true,
        quiz: Array.isArray(data.quiz) ? data.quiz : [],
        timer: timer,
        // Store quiz parameters for regeneration
        quizSubject: subject,
        quizQuestions: questions,
        quizAnswers: answers,
        quizDifficulties: difficulties,
        quizTypes: types,
        quizTimer: timer,
  quizHints: hints,
  quizImmediateFeedback: immediateFeedback
      }
      // Add the new quiz without removing the previous one if messageId is null (same parameters)
      if (messageId) {
        // Remove the confirm message and add the quiz (normal case)
        setMessages(prev => [...prev.filter(m => m.id !== messageId), quizMessage])
      } else {
        // Just add the new quiz without removing anything (same parameters case)
        setMessages(prev => [...prev, quizMessage])
      }
    } catch (e) {
      console.error('Quiz generation error:', e)
      const errorMessage = {
        id: Date.now(),
        sender: 'ai',
        text: 'تعطلت خدمة إنشاء الاختبار مؤقتاً. جرّب بعد شوية.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setQuizGenerating(false)
      setQuizConfirmingId(null)
      setQuizMode(false)
    }
  }

  const handleCancelQuiz = (messageId) => {
    // Remove confirm message and turn off quiz mode
    setMessages(prev => prev.filter(m => m.id !== messageId))
    setQuizConfirmingId(null)
    setQuizMode(false)
  }

  // Removed welcome screen conditional - we go straight to chat

  // Retry handler: remove the AI message, resend the previous user message, and track retry count
  const handleRetry = async (aiMessage) => {
    const idx = messages.findIndex(m => m.id === aiMessage.id)
    let prevUser = null
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i]?.sender === 'user') { prevUser = messages[i]; break }
    }
    if (prevUser) {
      // Remove the AI message being retried
      setMessages(prev => prev.filter(m => m.id !== aiMessage.id))
      
      // Update retry count
      const currentRetries = retryCount[prevUser.id] || 0
      setRetryCount(prev => ({ ...prev, [prevUser.id]: currentRetries + 1 }))
      
      // Resend the user message WITHOUT adding it to the messages array
      setIsLoading(true)
      
      try {
        let pdfText = '';
        if (prevUser.file) {
          pdfText = await readPDFFile(prevUser.file);
        }
        
        // Prepare history excluding the current user message to avoid duplication
        const history = [...messages].slice(-30).filter(m => m.id !== prevUser.id).map(msg => ({
          sender: msg.sender,
          text: msg.text
        }));
        
        const res = await fetch('http://localhost:3001/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: prevUser.text, 
            history, 
            pdfText,
            webSearch: prevUser.webSearch,
            fetchUrl: prevUser.fetchUrl,
            image: prevUser.image,
            pdfExport: aiMessage.isPdfExport || false
          })
        });
        
        const data = await res.json();
        if (!res.ok) {
          console.error('Server error response:', data);
          throw new Error('SERVICE_ERROR');
        }
        
        const aiResponse = {
          id: Date.now(), // Use timestamp for unique ID
          text: data.reply || 'صارّت مشكلة مؤقتة في الخدمة، جرّب بعد شوية.',
          sender: 'ai',
          timestamp: new Date(),
          isPdfExport: data.isPdfExport || false,
          pdfContent: data.pdfContent || null
        };
        
        setMessages(prev => [...prev.filter(m => m.id !== aiMessage.id), aiResponse]);
      } catch (err) {
        console.error('Retry error:', err);
        const friendly = 'صارت مشكلة تقنية مؤقتة في الخدمة. جرّب بعد شوية ولا تأكّد إلي الخادم شغّال.';
        setMessages(prev => [...prev.filter(m => m.id !== aiMessage.id), {
          id: Date.now(),
          text: friendly,
          sender: 'ai',
          timestamp: new Date()
        }]);
      }
      setIsLoading(false)
    }
  }

  // Edit handler: open modal to edit user message
  const handleEdit = (userMessage) => {
    setEditModal({ open: true, message: userMessage })
  }

  // Save edited user message and resend
  const handleSaveEdit = async (newText) => {
    setEditModal({ open: false, message: null })
    await handleSendMessage({ text: newText })
  }

  if (!user){
    return <AuthScreen onAuth={(u)=>{ setUser(u); startChat(); }} />
  }

  return (
    <div className="min-vh-100" style={{ 
      backgroundColor: '#202123', 
      background: 'linear-gradient(180deg, #343541 0%, #202123 100%)',
      color: '#f8f9fa' 
    }}>
      <div className='position-fixed top-0 end-0 p-3 d-flex gap-2' style={{zIndex:50}}>
        <button className='btn btn-sm btn-outline-light' onClick={async()=>{ await supabase.auth.signOut(); }}>Sign out</button>
      </div>
      {/* Removed ChatHeader - clean minimalist design like ChatGPT */}
      {/* Edit Modal */}
      {editModal.open && (
        <div className="modal show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">تعديل الرسالة</h5>
                <button type="button" className="btn-close" onClick={() => setEditModal({ open: false, message: null })}></button>
              </div>
              <div className="modal-body">
                <textarea className="form-control" defaultValue={editModal.message?.text || ''} rows={4} id="edit-textarea"></textarea>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditModal({ open: false, message: null })}>إلغاء</button>
                <button type="button" className="btn btn-primary" onClick={() => handleSaveEdit(document.getElementById('edit-textarea').value)}>إرسال</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Chat Container */}
      <div className="container-fluid px-4 pb-50 chat-container" style={{ paddingTop: '40px', paddingBottom: '100px' }}>
        <div className="row justify-content-center">
          <div className="col-lg-8 col-xl-6">
            <AnimatePresence>
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  onExport={handleExportPdf}
                  onDownloadPdf={handleDownloadPdf}
                  onConfirmPdfDownload={handleConfirmPdfDownload}
                  onConfirmQuiz={handleConfirmQuiz}
                  onCancelQuiz={handleCancelQuiz}
                  onRetry={handleRetry}
                  onEdit={handleEdit}
                  retryCount={message.sender === 'user' ? retryCount[message.id] || 0 : 0}
                  downloadingPdf={downloadingPdf}
                  generatingPreview={generatingPreview}
                  quizGenerating={quizGenerating}
                />
              ))}
            </AnimatePresence>
            {/* Loading Indicator */}
            {isLoading && <ChatMessage isLoading={true} />}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
      <ChatInput 
  onSendMessage={handleSendMessage}
  disabled={isLoading || generatingPreview || Boolean(quizConfirmingId) || quizGenerating}
  quizMode={quizMode}
  setQuizMode={setQuizMode}
      />
    </div>
  )
}

export default App
