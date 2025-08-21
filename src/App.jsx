import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import 'bootstrap/dist/css/bootstrap.min.css'
import ChatHeader from './components/ChatHeader'
import ChatMessage from './components/ChatMessage'
import ChatInput from './components/ChatInput'
import WelcomeScreen from './components/WelcomeScreen'
import './App.css'

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

    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      const aiResponse = {
        id: messages.length + 2,
        text: data.reply || 'حدث خطأ في الرد من Gemini API.',
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: messages.length + 2,
        text: 'حدث خطأ في الاتصال بواجهة Gemini API.',
        sender: 'ai',
        timestamp: new Date()
      }]);
    }
    setIsLoading(false);
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
