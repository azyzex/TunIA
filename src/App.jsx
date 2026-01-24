import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import 'bootstrap/dist/css/bootstrap.min.css'
import { MessageSquarePlus, MoreHorizontal, Pencil, Trash2, LogOut, PanelLeftClose, PanelLeft } from 'lucide-react'
import ChatHeader from './components/ChatHeader'
import ChatMessage from './components/ChatMessage'
import ChatInput from './components/ChatInput'
import WelcomeScreen from './components/WelcomeScreen'
import './App.css'
import AuthScreen from './components/AuthScreen'
import { supabase, ensureProfile, createConversation, addUserMessage, addAIMessage, fetchConversationMessages, fetchConversations, renameConversation, touchConversation, setConversationArchived } from '../supabaseClient'
// PDF.js: bundle worker locally to avoid network fetch issues
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function App() {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
  const [user, setUser] = useState(null);
  const [profileName, setProfileName] = useState('')
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  const [conversationMenuId, setConversationMenuId] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [renameModal, setRenameModal] = useState({ open: false, conv: null, value: '' })

  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordOk, setDeletePasswordOk] = useState(false)
  const [deletePasswordChecking, setDeletePasswordChecking] = useState(false)
  const [deletePasswordMsg, setDeletePasswordMsg] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState('')

  const accountBtnRef = useRef(null)
  const accountMenuRef = useRef(null)
  const deleteAccountModalRef = useRef(null)

  const messagesEndRef = useRef(null)
  const lastUserIdRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => { scrollToBottom() }, [messages])

  const mapDbMessageToUi = (msg) => {
    const meta = msg?.meta || {}
    return {
      id: msg.id,
      sender: msg.role === 'user' ? 'user' : 'ai',
      text: msg.text || '',
      timestamp: msg.created_at ? new Date(msg.created_at) : new Date(),
      isQuiz: Boolean(msg.is_quiz),
      isQuizConfirm: Boolean(msg.is_quiz_confirm),
      isPdfExport: Boolean(meta.isPdfExport),
      pdfContent: meta.pdfContent || null,
      isHistory: true
    }
  }

  const upsertConversation = (conv) => {
    if (!conv) return
    setConversations(prev => {
      const exists = prev.some(c => c.id === conv.id)
      const next = exists
        ? prev.map(c => (c.id === conv.id ? { ...c, ...conv } : c))
        : [conv, ...prev]
      return next.sort((a, b) => {
        const aDate = new Date(a.updated_at || a.created_at || 0).getTime()
        const bDate = new Date(b.updated_at || b.created_at || 0).getTime()
        return bDate - aDate
      })
    })
  }

  const selectConversation = async (convId) => {
    if (!convId) {
      setConversationId(null)
      setMessages([])
      return
    }
    setConversationId(convId)
    try {
      const data = await fetchConversationMessages(convId)
      setMessages((data || []).map(mapDbMessageToUi))
    } catch (e) {
      console.error('fetchConversationMessages', e)
      setMessages([])
    }
  }

  const loadConversations = async (autoSelect = true) => {
    if (!user) return
    setLoadingConversations(true)
    try {
      const data = await fetchConversations(user.id)
      setConversations(data)
      if (autoSelect && !conversationId) {
        if (data?.length) {
          await selectConversation(data[0].id)
        } else {
          setConversationId(null)
          setMessages([])
        }
      }
    } catch (e) {
      console.error('fetchConversations', e)
    } finally {
      setLoadingConversations(false)
    }
  }

  const handleNewChat = () => {
    setConversationId(null)
    setMessages([])
    setConversationMenuId(null)
  }

  const handleDeleteConversation = async (convId) => {
    try {
      const { error } = await supabase.from('conversations').delete().eq('id', convId)
      if (error) throw error
      setConversations(prev => {
        const remaining = prev.filter(c => c.id !== convId)
        if (convId === conversationId) {
          setConversationId(null)
          setMessages([])
        }
        return remaining
      })
    } catch (e) {
      console.error('delete conversation', e)
    } finally {
      setDeleteConfirmId(null)
      setConversationMenuId(null)
    }
  }

  const handleRenameConversation = async () => {
    if (!renameModal.conv || !renameModal.value.trim()) return
    try {
      const updated = await renameConversation(renameModal.conv.id, renameModal.value.trim())
      upsertConversation(updated)
    } catch (e) {
      console.error('rename conversation', e)
    } finally {
      setRenameModal({ open: false, conv: null, value: '' })
      setConversationMenuId(null)
    }
  }

  const handleArchiveConversation = async (convId) => {
    try {
      await setConversationArchived(convId, true)
      setConversations(prev => {
        const remaining = prev.filter(c => c.id !== convId)
        if (convId === conversationId) {
          if (remaining.length) {
            selectConversation(remaining[0].id)
          } else {
            setConversationId(null)
            setMessages([])
          }
        }
        return remaining
      })
    } catch (e) {
      console.error('archive conversation', e)
    }
  }

  const maybeUpdateConversationTitle = async (convId, text) => {
    const existing = conversations.find(c => c.id === convId)
    if (!existing?.title && text?.trim()) {
      try {
        const updated = await renameConversation(convId, text.slice(0, 60))
        upsertConversation(updated)
      } catch (e) {
        console.warn('renameConversation failed', e)
      }
    }
  }

  // Auth session listener
  useEffect(()=>{
    let mounted = true;
    (async()=>{
      const { data:{ session } } = await supabase.auth.getSession();
      if (mounted && session?.user){ setUser(session.user); await ensureProfile(session.user);}    
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session)=>{
      if (session?.user){ setUser(session.user); ensureProfile(session.user);} else { setUser(null); setConversationId(null); setMessages([]); setConversations([]);}  
    });
    return ()=>{ mounted=false; sub.subscription.unsubscribe(); };
  },[]);

  useEffect(() => {
    if (user) {
      loadConversations(false)
      if (lastUserIdRef.current !== user.id) {
        handleNewChat()
        lastUserIdRef.current = user.id
      }
    }
  }, [user])

  // Load display name for avatar letter
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user?.id) { setProfileName(''); return }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', user.id)
          .maybeSingle()
        if (cancelled) return
        if (error) throw error
        const fromProfile = data?.display_name || ''
        const fromMeta = user?.user_metadata?.username || user?.user_metadata?.display_name || ''
        const fromEmail = user?.email?.split('@')?.[0] || ''
        setProfileName(fromProfile || fromMeta || fromEmail)
      } catch (e) {
        const fromMeta = user?.user_metadata?.username || user?.user_metadata?.display_name || ''
        const fromEmail = user?.email?.split('@')?.[0] || ''
        setProfileName(fromMeta || fromEmail)
      }
    })()
    return () => { cancelled = true }
  }, [user])

  // Close account dropdown on outside click
  useEffect(() => {
    const onDown = (e) => {
      if (!accountMenuOpen) return
      const t = e.target
      if (accountBtnRef.current?.contains(t)) return
      if (accountMenuRef.current?.contains(t)) return
      setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [accountMenuOpen])

  // Debounced password verification for delete-account
  useEffect(() => {
    let timer = null
    let aborted = false
    if (!deleteAccountOpen) return

    setDeleteAccountError('')
    if (!deletePassword) {
      setDeletePasswordOk(false)
      setDeletePasswordChecking(false)
      setDeletePasswordMsg('')
      return
    }

    setDeletePasswordChecking(true)
    setDeletePasswordMsg('نثبتّو كلمة السر…')
    timer = setTimeout(async () => {
      try {
        const email = user?.email
        if (!email) throw new Error('NO_EMAIL')
        const res = await fetch(`${API_BASE}/api/verify-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: deletePassword })
        })
        if (aborted) return
        if (res.ok) {
          setDeletePasswordOk(true)
          setDeletePasswordMsg('كلمة السرّ صحيحة')
        } else {
          setDeletePasswordOk(false)
          setDeletePasswordMsg('كلمة السرّ غالطة')
        }
      } catch (e) {
        if (aborted) return
        setDeletePasswordOk(false)
        setDeletePasswordMsg('ما نجّمتش نثبتّ كلمة السرّ توّا')
      } finally {
        if (!aborted) setDeletePasswordChecking(false)
      }
    }, 450)

    return () => {
      aborted = true
      if (timer) clearTimeout(timer)
    }
  }, [deletePassword, deleteAccountOpen, API_BASE, user])

  const openDeleteAccount = () => {
    setAccountMenuOpen(false)
    setDeleteAccountOpen(true)
    setDeletePassword('')
    setDeletePasswordOk(false)
    setDeletePasswordChecking(false)
    setDeletePasswordMsg('')
    setDeleteAccountError('')
  }

  const closeDeleteAccount = () => {
    setDeleteAccountOpen(false)
    setDeletePassword('')
    setDeletePasswordOk(false)
    setDeletePasswordChecking(false)
    setDeletePasswordMsg('')
    setDeleteAccountError('')
  }

  const handleDeleteAccount = async () => {
    if (!deletePasswordOk || deletingAccount) return
    setDeletingAccount(true)
    setDeleteAccountError('')
    try {
      const email = user?.email
      if (!email) throw new Error('NO_EMAIL')
      const res = await fetch(`${API_BASE}/api/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: deletePassword })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'DELETE_FAILED')
      }
      await supabase.auth.signOut()
      window.location.href = 'https://tunia.pages.dev'
    } catch (e) {
      setDeleteAccountError(e?.message || 'صار مشكل وقت حذف الحساب')
    } finally {
      setDeletingAccount(false)
    }
  }

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
      const res = await fetch(`${API_BASE}/api/export-pdf`, {
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
      const response = await fetch(`${API_BASE}/export-pdf`, {
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
      
      const response = await fetch(`${API_BASE}${endpoint}`, {
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
    
    // Start with empty messages
    setMessages([])
    
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
      try { const conv = await createConversation(user.id, text?.trim() ? text.slice(0,60) : 'محادثة جديدة'); convId = conv.id; setConversationId(conv.id); upsertConversation(conv);} catch(e){ console.error('createConversation', e);} }

    const newMessage = { id: Date.now(), text, sender:'user', timestamp:new Date(), file, imagePreview: image?.previewUrl || null, isHistory: false };

  // Prepare history: last 30 messages before this one, excluding file
    const history = [...messages].slice(-30).map(msg => ({
      sender: msg.sender,
      text: msg.text
    }));

  setMessages(prev => [...prev, newMessage]);
  // Persist user message
  try { if (convId) await addUserMessage(convId, user.id, text); } catch(e){ console.warn('persist user message failed', e); }
  try { if (convId) { await maybeUpdateConversationTitle(convId, text); const touched = await touchConversation(convId); upsertConversation(touched); } } catch(e){ console.warn('touch conversation failed', e); }
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
      const res = await fetch(`${API_BASE}/api/chat`, {
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
          id: Date.now() + 1,
          text: 'اختبار قصير على الموضوع إلي طلبت عليه:',
          sender: 'ai',
          timestamp: new Date(),
          isQuiz: true,
          quiz: data.quiz,
          isHistory: false
        };
      } else {
        aiResponse = {
          id: Date.now() + 1,
          text: data.reply || 'صارّت مشكلة مؤقتة في الخدمة، جرّب بعد شوية.',
          sender: 'ai',
          timestamp: new Date(),
          isPdfExport: data.isPdfExport || false,
          pdfContent: data.pdfContent || null,
          isHistory: false
        };
      }
  setMessages(prev => [...prev, aiResponse]);
  // Persist AI message
  try { if (convId) await addAIMessage(convId, aiResponse.text, { isPdfExport: aiResponse.isPdfExport }); } catch(e){ console.warn('persist ai message failed', e); }
  try { if (convId) { const touched = await touchConversation(convId); upsertConversation(touched); } } catch(e){ console.warn('touch conversation failed', e); }
    } catch (err) {
      console.error('Fetch/chat error:', err);
      const friendly = 'صارت مشكلة تقنية مؤقتة في الخدمة. جرّب بعد شوية ولا تأكّد إلي الخادم شغّال.';
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
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
      const res = await fetch(`${API_BASE}/api/chat`, {
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
        
        const res = await fetch(`${API_BASE}/api/chat`, {
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
    return <AuthScreen onAuth={(u)=>{ setUser(u); }} />
  }

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`} style={{ 
      backgroundColor: '#202123', 
      background: 'linear-gradient(180deg, #343541 0%, #202123 100%)',
      color: '#f8f9fa',
      '--sidebar-width': sidebarOpen ? '260px' : '0px'
    }}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <MessageSquarePlus size={18} />
            <span>محادثة جديدة</span>
          </button>
        </div>
        <div className="sidebar-body">
          {loadingConversations && (
            <div className="text-muted small p-2">جاري التحميل…</div>
          )}
          {!loadingConversations && conversations.length === 0 && (
            <div className="text-muted small p-2">ما فما حتى محادثة</div>
          )}
          <div className="conversation-list">
            {conversations.map(conv => (
              <div 
                key={conv.id} 
                className={`conversation-item ${conv.id === conversationId ? 'active' : ''}`}
                onClick={() => { selectConversation(conv.id); setConversationMenuId(null); }}
              >
                <span className="conversation-title-text">
                  {conv.title || 'محادثة جديدة'}
                </span>
                <button
                  className="conversation-menu-btn"
                  onClick={(e) => { e.stopPropagation(); setConversationMenuId(conversationMenuId === conv.id ? null : conv.id); }}
                >
                  <MoreHorizontal size={16} />
                </button>
                {conversationMenuId === conv.id && (
                  <div className="conversation-dropdown" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setRenameModal({ open: true, conv, value: conv.title || '' }); setConversationMenuId(null); }}>
                      <Pencil size={14} />
                      <span>تعديل الاسم</span>
                    </button>
                    <button className="danger" onClick={() => { setDeleteConfirmId(conv.id); setConversationMenuId(null); }}>
                      <Trash2 size={14} />
                      <span>حذف</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="sidebar-footer">
          <div className="account-area">
            <button
              ref={accountBtnRef}
              className="account-btn"
              onClick={() => setAccountMenuOpen(prev => !prev)}
              aria-label="Account"
              type="button"
            >
              <span className="account-letter">
                {(profileName || user?.email || 'U').trim().charAt(0).toUpperCase()}
              </span>
            </button>

            <AnimatePresence>
              {accountMenuOpen && (
                <motion.div
                  ref={accountMenuRef}
                  className="account-dropdown"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      setAccountMenuOpen(false)
                      await supabase.auth.signOut()
                    }}
                  >
                    <LogOut size={14} />
                    <span>تسجيل الخروج</span>
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={openDeleteAccount}
                  >
                    <Trash2 size={14} />
                    <span>حذف الحساب</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </aside>

      {/* Delete Account Modal */}
      <AnimatePresence>
        {deleteAccountOpen && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeDeleteAccount}
          >
            <motion.div
              ref={deleteAccountModalRef}
              className="confirm-modal"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h6>متأكد باش تحذف حسابك؟</h6>
              <p>
                كانك تحذف الحساب، المحادثات الكلّ وبياناتك باش تتمسح نهائياً وما عادش تنجم ترجعهم.
              </p>

              <div className="delete-account-box">
                <label className="form-label" style={{ color: '#d1d1d1', textAlign: 'right', width: '100%' }}>
                  اكتب كلمة السرّ متاعك باش نكمّلو
                </label>
                <input
                  type="password"
                  className="rename-input"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="كلمة السرّ"
                  autoFocus
                />
                {deletePasswordMsg && (
                  <div className={`delete-hint ${deletePasswordOk ? 'ok' : ''}`}>
                    {deletePasswordChecking ? '… ' : ''}{deletePasswordMsg}
                  </div>
                )}
                {deleteAccountError && (
                  <div className="alert alert-danger py-2 small" style={{ marginTop: 10 }}>
                    {deleteAccountError}
                  </div>
                )}
              </div>

              <div className="confirm-actions">
                <button className="btn-cancel" onClick={closeDeleteAccount} disabled={deletingAccount}>إلغاء</button>
                <button
                  className={`btn-danger ${(!deletePasswordOk || deletingAccount) ? 'disabled' : ''}`}
                  onClick={handleDeleteAccount}
                  disabled={!deletePasswordOk || deletingAccount}
                >
                  {deletingAccount ? 'جاري الحذف…' : 'حذف نهائي'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h6>هل أنت متأكد؟</h6>
            <p>باش تتحذف المحادثة هاذي نهائياً.</p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setDeleteConfirmId(null)}>إلغاء</button>
              <button className="btn-danger" onClick={() => handleDeleteConversation(deleteConfirmId)}>حذف</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModal.open && (
        <div className="modal-overlay" onClick={() => setRenameModal({ open: false, conv: null, value: '' })}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h6>تعديل اسم المحادثة</h6>
            <input
              type="text"
              className="rename-input"
              value={renameModal.value}
              onChange={(e) => setRenameModal(prev => ({ ...prev, value: e.target.value }))}
              placeholder="اسم المحادثة"
              autoFocus
            />
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setRenameModal({ open: false, conv: null, value: '' })}>إلغاء</button>
              <button className="btn-primary" onClick={handleRenameConversation}>حفظ</button>
            </div>
          </div>
        </div>
      )}

      <main className="main-panel">
        <button className="sidebar-toggle" onClick={()=> setSidebarOpen(prev => !prev)}>
          {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
        </button>
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
  hasMessages={messages.length > 0}
      />
      </main>
    </div>
  )
}

export default App
