import React from 'react'
import { motion } from 'framer-motion'
import { Bot, User, FileText } from 'lucide-react'

const ChatMessage = ({ message, isLoading = false }) => {
  const isUser = message?.sender === 'user'
  
  const formatTime = (date) => {
    return date.toLocaleTimeString('ar-TN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="d-flex justify-content-start mb-3"
      >
        <div className="d-flex align-items-start">
          <div className="bg-gradient rounded-circle d-flex align-items-center justify-content-center me-3"
               style={{ 
                 width: '32px', 
                 height: '32px',
                 background: 'linear-gradient(135deg, #6f42c1, #e83e8c)'
               }}>
            <Bot size={16} className="text-white" />
          </div>
          <div className="chat-bubble chat-bubble-ai">
            <div className="typing-indicator">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  if (!message) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`d-flex mb-3 ${isUser ? 'justify-content-end' : 'justify-content-start'}`}
    >
      <div className={`d-flex align-items-start ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div className={`rounded-circle d-flex align-items-center justify-content-center ${isUser ? 'ms-3' : 'me-3'}`}
             style={{ 
               width: '32px', 
               height: '32px',
               background: isUser 
                 ? 'linear-gradient(135deg, #007bff, #0056b3)' 
                 : 'linear-gradient(135deg, #6f42c1, #e83e8c)'
             }}>
          {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
        </div>

        {/* Message Bubble */}
        <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
          {message.file && (
            <div className="d-flex align-items-center mb-2 p-2 rounded"
                 style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
              <FileText size={16} className="me-2" />
              <small>{message.file.name}</small>
            </div>
          )}
          <p className="mb-1 message-rtl" style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>
            {message.text}
          </p>
          <div className={`text-muted ${isUser ? 'text-end' : 'text-start'}`}>
            <small style={{ fontSize: '0.75rem', opacity: 0.7 }}>
              {formatTime(message.timestamp)}
            </small>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ChatMessage
