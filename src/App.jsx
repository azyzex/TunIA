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

  const handleSendMessage = ({ text, file }) => {
    if (!text.trim() && !file) return

    const newMessage = {
      id: messages.length + 1,
      text: text,
      sender: 'user',
      timestamp: new Date(),
      file: file
    }

    setMessages(prev => [...prev, newMessage])
    setIsLoading(true)

    // Simulate AI response (will be replaced with actual Gemini API call)
    setTimeout(() => {
      const responses = [
        "شكراً على سؤالك! هذا سؤال مثير للاهتمام. بش نحاول نجاوبك بأفضل طريقة ممكنة بالدارجة التونسية.",
        "براي هذا السؤال يحتاج شوية تفكير. خليني نشرحلك الموضوع بطريقة مبسطة.",
        "ممتاز! هذا السؤال الأكاديمي بش يساعدك تفهم الموضوع أكثر. تعال نشوف مع بعض.",
        "هاي نقطة مهمة في الدراسة! بش نعطيك معلومات مفيدة حول هذا الموضوع.",
      ]
      
      const aiResponse = {
        id: messages.length + 2,
        text: responses[Math.floor(Math.random() * responses.length)],
        sender: 'ai',
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, aiResponse])
      setIsLoading(false)
    }, Math.random() * 2000 + 1000) // Random delay between 1-3 seconds
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
