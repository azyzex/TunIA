import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import 'bootstrap/dist/css/bootstrap.min.css'
import ChatHeader from './components/ChatHeader'
import ChatMessage from './components/ChatMessage'
import ChatInput from './components/ChatInput'
import WelcomeScreen from './components/WelcomeScreen'
import './App.css'
// PDF.js: bundle worker locally to avoid network fetch issues
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function App() {
  const [showWelcome, setShowWelcome] = useState(true)
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const startChat = (initialMessage = null) => {
    setShowWelcome(false)
    
    // Add welcome message from AI
    const welcomeMessage = {
      id: 1,
      text: "أهلاً بيك في TUNIA! أنا هنا باش نساعدك في الأسئلة الأكاديمية بالدارجة التونسية. اسألني على أي حاجة تحب تعرفها!",
      sender: 'ai',
      timestamp: new Date()
    }
    
    setMessages([welcomeMessage])
    
    // If there's an initial message, send it
    if (initialMessage) {
      setTimeout(() => {
        handleSendMessage({ text: initialMessage })
      }, 500)
    }
  }

  const handleSendMessage = async ({ text, file }) => {
    if (!text.trim() && !file) return;

    const newMessage = {
      id: messages.length + 1,
      text: text,
      sender: 'user',
      timestamp: new Date(),
      file: file
    };

    // Prepare history: last 30 messages before this one, excluding file
    const history = [...messages].slice(-30).map(msg => ({
      sender: msg.sender,
      text: msg.text
    }));

    setMessages(prev => [...prev, newMessage]);
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
      });
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, pdfText })
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Server error response:', data);
        throw new Error(data?.message || data?.error || 'Server error');
      }
      const aiResponse = {
        id: messages.length + 2,
        text: data.reply || 'حدث خطأ في الرد من Gemini API.',
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);
    } catch (err) {
      console.error('Fetch/chat error:', err);
      setMessages(prev => [...prev, {
        id: messages.length + 2,
        text: `حدث خطأ في الاتصال بواجهة Gemini API: ${err.message}`,
        sender: 'ai',
        timestamp: new Date()
      }]);
    }
    setIsLoading(false);
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
        // Limit PDF text to first 10,000 characters
        if (text.length > 10000) {
          text = text.slice(0, 10000);
        }
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
  }

  if (showWelcome) {
    return <WelcomeScreen onStartChat={startChat} />
  }

  return (
    <div className="min-vh-100 tunisian-bg">
      <ChatHeader />
      
      {/* Chat Container */}
      <div className="container-fluid px-4 pb-5 chat-container" style={{ paddingTop: '100px', paddingBottom: '120px' }}>
        <div className="row justify-content-center">
          <div className="col-lg-8 col-xl-6">
            <AnimatePresence>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
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
        disabled={isLoading}
      />
    </div>
  )
}

export default App
