import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { motion } from 'framer-motion'
import { Bot, User, FileText, RotateCcw, Pencil, Copy, Download, Loader2 } from 'lucide-react'

const ChatMessage = ({ message, isLoading = false, onExport, onRetry, onEdit, onDownloadPdf, onConfirmPdfDownload, onConfirmQuiz, onCancelQuiz, retryCount, downloadingPdf, generatingPreview }) => {
  const isUser = message?.sender === 'user'
  // Per-message toggle for including citations in PDF
  const [includeCitations, setIncludeCitations] = useState(true)
  // Quiz UI state
  const [quizSelections, setQuizSelections] = useState(() => (message?.isQuiz && Array.isArray(message.quiz) ? Array(message.quiz.length).fill(null) : []))
  const [quizRevealed, setQuizRevealed] = useState(false)
  
  const formatTime = (date) => {
    return date.toLocaleTimeString('ar-TN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      // You could add a toast notification here if desired
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
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
          <div className="d-flex flex-column align-items-end">
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
                      const codeString = String(children).replace(/\n$/, '')
                      if (inline) {
                        return <code className={className} {...props}>{children}</code>
                      }
                      return (
                        <div className="position-relative">
                          <pre className="bg-light p-2 rounded text-start" style={{ fontSize: '0.92rem', overflowX: 'auto', direction: 'ltr' }}>
                            <code className={className} {...props}>{children}</code>
                          </pre>
                          <button 
                            onClick={() => copyToClipboard(codeString)}
                            className="btn btn-sm btn-outline-secondary position-absolute top-0 end-0 m-1"
                            style={{ fontSize: '0.7rem' }}
                            title="نسخ الكود"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      );
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
            </div>
            {/* Timestamp and actions outside the bubble */}
            <div className={`text-muted text-end d-flex align-items-center justify-content-end gap-2 mt-1`} style={{ fontSize: '0.75rem' }}>
              <small style={{ opacity: 0.7 }}>
                {formatTime(message.timestamp)}
              </small>
              {retryCount > 0 && (
                <small style={{ opacity: 0.7 }}>
                  • {retryCount} إعادة محاولة
                </small>
              )}
              <button
                type="button"
                className="btn btn-link btn-sm p-0 ms-1"
                onClick={() => copyToClipboard(message.text)}
                title="نسخ"
                style={{ verticalAlign: 'middle' }}
              >
                <Copy size={14} />
              </button>
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
        {!message.isQuiz ? (
        <ReactMarkdown
          components={{
            code({node, inline, className, children, ...props}) {
              const codeString = String(children).replace(/\n$/, '')
              if (inline) {
                return <code className={className} {...props}>{children}</code>
              }
              return (
                <div className="position-relative">
                  <pre className="bg-light p-2 rounded text-start" style={{ fontSize: '0.92rem', overflowX: 'auto', direction: 'ltr' }}>
                    <code className={className} {...props}>{children}</code>
                  </pre>
                  <button 
                    onClick={() => copyToClipboard(codeString)}
                    className="btn btn-sm btn-outline-secondary position-absolute top-0 end-0 m-1"
                    style={{ fontSize: '0.7rem' }}
                    title="نسخ الكود"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              );
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
  ) : (
          <div className="quiz-block">
            {Array.isArray(message.quiz) && message.quiz.map((q, qi) => (
              <div key={qi} className="mb-3 p-2 border rounded">
                <div className="fw-bold mb-2">{qi + 1}. {q.question}</div>
                <div className="d-flex flex-column gap-2">
                  {q.options.map((opt, oi) => {
                    const selected = quizSelections[qi] === oi
                    const isCorrect = q.correctIndex === oi
                    const show = quizRevealed
                    const bg = show
                      ? (isCorrect ? 'rgba(25,135,84,0.15)' : (selected ? 'rgba(220,53,69,0.15)' : 'transparent'))
                      : (selected ? 'rgba(13,110,253,0.12)' : 'transparent')
                    const border = show
                      ? (isCorrect ? '1px solid #198754' : (selected ? '1px solid #dc3545' : '1px solid #dee2e6'))
                      : (selected ? '1px solid #0d6efd' : '1px solid #dee2e6')
                    return (
                      <button
                        key={oi}
                        type="button"
                        className="btn text-start"
                        style={{ background: bg, border, borderRadius: 8 }}
                        onClick={() => {
                          if (quizRevealed) return
                          const next = [...quizSelections]
                          next[qi] = oi
                          setQuizSelections(next)
                        }}
                      >
                        <div className="d-flex align-items-center">
                          <input
                            type="radio"
                            name={`q-${message.id}-${qi}`}
                            checked={selected}
                            readOnly
                            className="me-2"
                          />
                          <span>{opt}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="mt-3">
              {!quizRevealed ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setQuizRevealed(true)}
                  disabled={quizSelections.some((s) => s === null)}
                >
                  تصحيح الإجابات
                </button>
              ) : (
                <div className="alert alert-info">تم إظهار الإجابات الصحيحة باللون الأخضر والخاطئة بالأحمر.</div>
              )}
            </div>
          </div>
        )}
      </div>
      {message.isQuizConfirm && (
        <div className="mt-3 mb-2">
          <div className="d-flex flex-wrap align-items-center gap-3">
            <div className="d-flex align-items-center gap-2">
              <label className="form-label m-0">عدد الأسئلة</label>
              <input type="number" className="form-control" defaultValue={message.quizDefaultQuestions || 5} min={5} max={30} style={{ width: 90 }} id={`qcount-${message.id}`} />
            </div>
            <div className="d-flex align-items-center gap-2">
              <label className="form-label m-0">عدد الخيارات</label>
              <input type="number" className="form-control" defaultValue={message.quizDefaultAnswers || 4} min={2} max={6} style={{ width: 90 }} id={`acount-${message.id}`} />
            </div>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => {
                const questions = Math.max(5, Math.min(30, parseInt(document.getElementById(`qcount-${message.id}`).value || '5', 10)))
                const answers = Math.max(2, Math.min(6, parseInt(document.getElementById(`acount-${message.id}`).value || '4', 10)))
                onConfirmQuiz && onConfirmQuiz({ subject: message.quizSubject || '', questions, answers, messageId: message.id })
              }}
            >
              نعم، أنشئ الاختبار
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => onCancelQuiz && onCancelQuiz(message.id)}
            >
              لا
            </button>
          </div>
        </div>
      )}
      {message.isPdfPreview && (
        <div className="mt-3 mb-2 d-flex align-items-center gap-3 flex-wrap">
          <div className="form-check form-switch d-flex align-items-center">
            <input
              className="form-check-input"
              type="checkbox"
              id={`citations-switch-${message.id}`}
              checked={includeCitations}
              onChange={(e) => setIncludeCitations(e.target.checked)}
            />
            <label className="form-check-label ms-2" htmlFor={`citations-switch-${message.id}`}>
              المراجع
            </label>
          </div>
          <button
            type="button"
            className="btn btn-success d-flex align-items-center gap-2"
            onClick={() => onConfirmPdfDownload && onConfirmPdfDownload(message.pdfData, message.id, includeCitations)}
            disabled={downloadingPdf === message.id}
          >
            {downloadingPdf === message.id ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>جاري تحميل الـ PDF...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>  PDF تحميل</span>
              </>
            )}
          </button>
        </div>
      )}
      <div className={`text-muted text-start d-flex align-items-center gap-2`}>
        <small style={{ fontSize: '0.75rem', opacity: 0.7 }}>
          {formatTime(message.timestamp)}
        </small>
        {retryCount > 0 && (
          <small style={{ fontSize: '0.75rem', opacity: 0.7 }}>
            • {retryCount} إعادة محاولة
          </small>
        )}
        <button
          type="button"
          className="btn btn-link btn-sm p-0 ms-1"
          onClick={() => copyToClipboard(message.text)}
          title="نسخ"
          style={{ verticalAlign: 'middle' }}
        >
          <Copy size={14} />
        </button>
        {!message.isWelcomeMessage && !message.isPdfPreview && (
          <button
            type="button"
            className="btn btn-link btn-sm p-0 ms-2"
            onClick={() => onDownloadPdf && onDownloadPdf(message.id)}
            title="تحميل كـ PDF"
            style={{ verticalAlign: 'middle' }}
            disabled={generatingPreview === message.id}
          >
            {generatingPreview === message.id ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
          </button>
        )}
        {!message.isWelcomeMessage && !message.isPdfPreview && (
          <button
            type="button"
            className="btn btn-link btn-sm p-0 ms-2"
            onClick={() => onRetry && onRetry(message)}
            title="أعد المحاولة"
            style={{ verticalAlign: 'middle' }}
          >
            <RotateCcw size={16} />
          </button>
        )}
      </div>
    </div>
  )}
      </div>
    </motion.div>
  )
}

export default ChatMessage
