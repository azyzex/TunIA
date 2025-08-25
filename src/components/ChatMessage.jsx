import React from 'react'
import ReactMarkdown from 'react-markdown'
import { motion } from 'framer-motion'
import { Bot, User, FileText, RotateCcw, Pencil } from 'lucide-react'

const ChatMessage = ({ message, isLoading = false, onExport, onRetry, onEdit }) => {
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
  {isUser ? (
    <div className="chat-bubble chat-bubble-user">
      {message.file && (
        <div className="d-flex align-items-center mb-2 p-2 rounded"
             style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
          <FileText size={16} className="me-2" />
          <small>{message.file.name}</small>
        </div>
      )}
      {message.imagePreview && (
        <div className="mb-2">
          <img src={message.imagePreview} alt="uploaded" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8 }} />
        </div>
      )}
      <div className="mb-1 message-rtl" style={{ fontSize: '0.97rem', lineHeight: '1.7', wordBreak: 'break-word' }}>
        <ReactMarkdown
          components={{
            code({node, inline, className, children, ...props}) {
              return inline
                ? <code className={className} {...props}>{children}</code>
                : <pre className="bg-light p-2 rounded" style={{ fontSize: '0.92rem', overflowX: 'auto' }}><code className={className} {...props}>{children}</code></pre>;
            },
            ul({children, ...props}) {
              return <ul className="ms-3" {...props}>{children}</ul>;
            },
            ol({children, ...props}) {
              return <ol className="ms-3" {...props}>{children}</ol>;
            },
            h1({children, ...props}) {
              return <h1 className="fw-bold mt-3 mb-2" {...props}>{children}</h1>;
            },
            h2({children, ...props}) {
              return <h2 className="fw-bold mt-3 mb-2" {...props}>{children}</h2>;
            },
            h3({children, ...props}) {
              return <h3 className="fw-bold mt-3 mb-2" {...props}>{children}</h3>;
            },
            p({children, ...props}) {
              return <p className="mb-2" {...props}>{children}</p>;
            }
          }}
        >
          {message.text}
        </ReactMarkdown>
      </div>
      <div className={`text-muted text-end d-flex align-items-center gap-2`}>
        <small style={{ fontSize: '0.75rem', opacity: 0.7 }}>
          {formatTime(message.timestamp)}
        </small>
        <button
          type="button"
          className="btn btn-link btn-sm p-0 ms-2"
          onClick={() => onEdit && onEdit(message)}
          title="تعديل"
          style={{ verticalAlign: 'middle' }}
        >
          <Pencil size={16} />
        </button>
      </div>
    </div>
  ) : (
    <div className="w-100 mb-1">
      {message.file && (
        <div className="d-flex align-items-center mb-2 p-2 rounded"
             style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
          <FileText size={16} className="me-2" />
          <small>{message.file.name}</small>
        </div>
      )}
      {message.imagePreview && (
        <div className="mb-2">
          <img src={message.imagePreview} alt="uploaded" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8 }} />
        </div>
      )}
      <div className="mb-1 message-rtl" style={{ fontSize: '0.97rem', lineHeight: '1.7', wordBreak: 'break-word' }}>
        <ReactMarkdown
          components={{
            code({node, inline, className, children, ...props}) {
              return inline
                ? <code className={className} {...props}>{children}</code>
                : <pre className="bg-light p-2 rounded" style={{ fontSize: '0.92rem', overflowX: 'auto' }}><code className={className} {...props}>{children}</code></pre>;
            },
            ul({children, ...props}) {
              return <ul className="ms-3" {...props}>{children}</ul>;
            },
            ol({children, ...props}) {
              return <ol className="ms-3" {...props}>{children}</ol>;
            },
            h1({children, ...props}) {
              return <h1 className="fw-bold mt-3 mb-2" {...props}>{children}</h1>;
            },
            h2({children, ...props}) {
              return <h2 className="fw-bold mt-3 mb-2" {...props}>{children}</h2>;
            },
            h3({children, ...props}) {
              return <h3 className="fw-bold mt-3 mb-2" {...props}>{children}</h3>;
            },
            p({children, ...props}) {
              return <p className="mb-2" {...props}>{children}</p>;
            }
          }}
        >
          {message.text}
        </ReactMarkdown>
      </div>
      <div className={`text-muted text-start d-flex align-items-center gap-2`}>
        <small style={{ fontSize: '0.75rem', opacity: 0.7 }}>
          {formatTime(message.timestamp)}
        </small>
        <button
          type="button"
          className="btn btn-link btn-sm p-0"
          onClick={() => onExport && onExport(message)}
          title="تصدير كـ PDF"
        >
          تصدير كـ PDF
        </button>
        <button
          type="button"
          className="btn btn-link btn-sm p-0 ms-2"
          onClick={() => onRetry && onRetry(message)}
          title="أعد المحاولة"
          style={{ verticalAlign: 'middle' }}
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  )}
      </div>
    </motion.div>
  )
}

export default ChatMessage
