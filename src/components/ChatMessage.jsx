import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { motion } from 'framer-motion'
import { Bot, User, FileText, RotateCcw, Pencil, Copy, Download, Loader2 } from 'lucide-react'

const ChatMessage = ({ message, isLoading = false, onExport, onRetry, onEdit, onDownloadPdf, onConfirmPdfDownload, onConfirmQuiz, onCancelQuiz, retryCount, downloadingPdf, generatingPreview, quizGenerating = false }) => {
  const isUser = message?.sender === 'user'
  // Per-message toggle for including citations in PDF
  const [includeCitations, setIncludeCitations] = useState(true)
  // Quiz UI state
  const [quizSelections, setQuizSelections] = useState([])
  const [quizRevealed, setQuizRevealed] = useState(false)
  const [quizScore, setQuizScore] = useState(null)
  // Quiz confirm params state
  const [selDifficulties, setSelDifficulties] = useState(['medium']) // easy, medium, hard
  const [selTypes, setSelTypes] = useState(['mcq']) // mcq, mcma, tf, fitb
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [timerMinutes, setTimerMinutes] = useState(10)
  const [hintsEnabled, setHintsEnabled] = useState(false)
  // Input validation state
  const [questionsCount, setQuestionsCount] = useState(message?.quizDefaultQuestions || 5)
  const [answersCount, setAnswersCount] = useState(message?.quizDefaultAnswers || 4)
  // Timer state for active quiz
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [timerExpired, setTimerExpired] = useState(false)
  // Hints state for individual questions
  const [hintsVisible, setHintsVisible] = useState([])

  // Initialize selections when a quiz arrives
  React.useEffect(() => {
    if (message?.isQuiz && Array.isArray(message.quiz)) {
      const init = message.quiz.map((q) => {
        const t = String(q.type || 'mcq').toLowerCase()
        if (t === 'mcma') return []
        if (t === 'fitb') return ''
        return null // mcq/tf
      })
      setQuizSelections(init)
      setQuizRevealed(false)
      setQuizScore(null)
      setTimerExpired(false)
      setTimeRemaining(null)
      // Initialize hints visibility (all hidden by default)
      setHintsVisible(Array(message.quiz.length).fill(false))
    }
  }, [message?.isQuiz, Array.isArray(message?.quiz) ? message.quiz.length : 0])

  // Timer logic for quiz
  React.useEffect(() => {
    if (message?.isQuiz && message.timer && !quizRevealed && !timerExpired) {
      const totalSeconds = message.timer * 60
      setTimeRemaining(totalSeconds)
      
      const interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setTimerExpired(true)
            setQuizRevealed(true)
            // Calculate score when timer expires
            setTimeout(() => {
              const score = calculateScore()
              setQuizScore(score)
            }, 100)
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      
      return () => clearInterval(interval)
    }
  }, [message?.isQuiz, message?.timer, quizRevealed, timerExpired])
  
  const formatTime = (date) => {
    return date.toLocaleTimeString('ar-TN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
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

  // Calculate quiz score
  const calculateScore = () => {
    if (!Array.isArray(message?.quiz)) return null
    
    let correctAnswers = 0
    const totalQuestions = message.quiz.length
    const results = []
    
    for (let i = 0; i < message.quiz.length; i++) {
      const question = message.quiz[i]
      const userSelection = quizSelections[i]
      const type = String(question.type || 'mcq').toLowerCase()
      
      let isCorrect = false
      
      if (type === 'mcma') {
        // Multiple choice multiple answer
        const correctIndices = Array.isArray(question.correctIndices) ? question.correctIndices : []
        const userIndices = Array.isArray(userSelection) ? userSelection : []
        
        // Check if arrays are equal (same length and same elements)
        isCorrect = correctIndices.length === userIndices.length && 
                   correctIndices.every(idx => userIndices.includes(idx))
      } else if (type === 'fitb') {
        // Fill in the blank - case insensitive comparison
        const correctAnswer = String(question.correctAnswer || '').toLowerCase().trim()
        const userAnswer = String(userSelection || '').toLowerCase().trim()
        isCorrect = correctAnswer === userAnswer
      } else {
        // MCQ or True/False
        isCorrect = question.correctIndex === userSelection
      }
      
      if (isCorrect) correctAnswers++
      
      results.push({
        questionIndex: i,
        isCorrect,
        userAnswer: userSelection,
        correctAnswer: type === 'mcma' ? question.correctIndices : 
                      type === 'fitb' ? question.correctAnswer : question.correctIndex
      })
    }
    
    const percentage = Math.round((correctAnswers / totalQuestions) * 100)
    
    return {
      correct: correctAnswers,
      total: totalQuestions,
      percentage,
      results
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
    <>
      {/* Floating Timer */}
      {message?.isQuiz && message.timer && timeRemaining !== null && !quizRevealed && (
        <div 
          className="position-fixed bg-warning text-dark px-3 py-2 rounded shadow-lg"
          style={{ 
            top: '80px', 
            right: '20px', 
            zIndex: 1040,
            fontWeight: 'bold',
            fontSize: '1.1rem'
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <i className="fas fa-clock" style={{ fontSize: '1rem' }}></i>
            <span>{formatTimer(timeRemaining)}</span>
          </div>
          {timerExpired && (
            <div className="small text-center mt-1" style={{ fontSize: '0.8rem' }}>
              انتهى الوقت!
            </div>
          )}
        </div>
      )}
      
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
            {Array.isArray(message.quiz) && message.quiz.map((q, qi) => {
              const type = String(q.type || 'mcq').toLowerCase()
              return (
                <div key={qi} className="mb-3 p-2 border rounded">
                  <div className="fw-bold mb-2">{qi + 1}. {q.question}</div>
                  {q.hint && (
                    <div className="mb-2">
                      <button
                        type="button"
                        className="btn btn-outline-info btn-sm"
                        onClick={() => {
                          const next = [...hintsVisible]
                          next[qi] = !next[qi]
                          setHintsVisible(next)
                        }}
                        style={{ fontSize: '0.8rem' }}
                      >
                        💡 {hintsVisible[qi] ? 'إخفاء التلميحة' : 'إظهار تلميحة'}
                      </button>
                      {hintsVisible[qi] && (
                        <div className="mt-2 p-2 bg-light rounded" style={{ fontSize: '0.85rem', color: '#666', fontStyle: 'italic' }}>
                          {q.hint}
                        </div>
                      )}
                    </div>
                  )}
                  {type === 'fitb' ? (
                    <div className="d-flex align-items-center gap-2">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="اكتب الإجابة"
                        value={quizSelections[qi] ?? ''}
                        disabled={quizRevealed || (message.timer && timeRemaining <= 0)}
                        onChange={(e) => {
                          if (quizRevealed || (message.timer && timeRemaining <= 0)) return
                          const next = [...quizSelections]
                          next[qi] = e.target.value
                          setQuizSelections(next)
                        }}
                        style={quizRevealed ? {
                          borderColor: (() => {
                            const val = String(quizSelections[qi] || '').trim().toLowerCase()
                            const ok = [String(q.answerText||'').trim().toLowerCase(), ...((q.acceptableAnswers||[]).map(s=>String(s).trim().toLowerCase()))].includes(val)
                            return ok ? '#198754' : '#dc3545'
                          })()
                        } : {}}
                      />
                      {quizRevealed && (
                        <small className="text-muted">الإجابة الصحيحة: <strong>{q.answerText}</strong></small>
                      )}
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {(q.options || []).map((opt, oi) => {
                        const show = quizRevealed
                        if (type === 'mcma') {
                          const selectedArr = Array.isArray(quizSelections[qi]) ? quizSelections[qi] : []
                          const selected = selectedArr.includes(oi)
                          const isCorrect = Array.isArray(q.correctIndices) ? q.correctIndices.includes(oi) : false
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
                                if (quizRevealed || (message.timer && timeRemaining <= 0)) return
                                const next = [...quizSelections]
                                const cur = Array.isArray(next[qi]) ? [...next[qi]] : []
                                const idx = cur.indexOf(oi)
                                if (idx >= 0) cur.splice(idx,1); else cur.push(oi)
                                next[qi] = cur
                                setQuizSelections(next)
                              }}
                            >
                              <div className="d-flex align-items-center">
                                <input type="checkbox" checked={selected} readOnly className="me-2" />
                                <span>{opt}</span>
                              </div>
                            </button>
                          )
                        } else {
                          // mcq / tf
                          const selected = quizSelections[qi] === oi
                          const isCorrect = q.correctIndex === oi
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
                                if (quizRevealed || (message.timer && timeRemaining <= 0)) return
                                const next = [...quizSelections]
                                next[qi] = oi
                                setQuizSelections(next)
                              }}
                            >
                              <div className="d-flex align-items-center">
                                <input type="radio" name={`q-${message.id}-${qi}`} checked={selected} readOnly className="me-2" />
                                <span>{opt}</span>
                              </div>
                            </button>
                          )
                        }
                      })}
                    </div>
                  )}
                  {/* Show explanation after quiz is revealed */}
                  {quizRevealed && q.explanation && (
                    <div className="mt-2 p-2 rounded bg-light border-start border-primary border-3">
                      <small className="text-muted fw-bold">الشرح:</small>
                      <div className="small text-dark mt-1">{q.explanation}</div>
                    </div>
                  )}
                </div>
              )
            })}
            <div className="mt-3">
              {!quizRevealed ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const score = calculateScore()
                    setQuizScore(score)
                    setQuizRevealed(true)
                  }}
                  disabled={(() => {
                    if (!Array.isArray(message.quiz)) return true
                    // If timer is active, don't allow manual reveal unless time expired
                    if (message.timer && timeRemaining > 0) return true
                    for (let i=0;i<message.quiz.length;i++){
                      const t = String(message.quiz[i].type || 'mcq').toLowerCase()
                      const sel = quizSelections[i]
                      if (t === 'mcma') { if (!Array.isArray(sel) || sel.length === 0) return true }
                      else if (t === 'fitb') { if (!String(sel||'').trim()) return true }
                      else { if (sel === null || sel === undefined) return true }
                    }
                    return false
                  })()}
                >
                  تصحيح الإجابات
                </button>
              ) : (
                <>
                  <div className="alert alert-info">
                    {timerExpired ? 
                      'انتهى الوقت! تم إظهار الإجابات الصحيحة باللون الأخضر والخاطئة بالأحمر.' :
                      'تم إظهار الإجابات الصحيحة باللون الأخضر والخاطئة بالأحمر.'
                    }
                  </div>
                  
                  {/* Quiz Score Display */}
                  {quizScore && (
                    <div className="mt-3">
                      <div className={`card border-0 ${quizScore.percentage >= 80 ? 'bg-success' : quizScore.percentage >= 60 ? 'bg-warning' : 'bg-danger'} bg-opacity-10`}>
                        <div className="card-body text-center py-3">
                          <h5 className="card-title mb-2">
                            <i className="fas fa-chart-line me-2"></i>
                            نتيجة الاختبار
                          </h5>
                          <div className="row">
                            <div className="col-4">
                              <div className="text-success fw-bold fs-4">{quizScore.correct}</div>
                              <small className="text-muted">إجابات صحيحة</small>
                            </div>
                            <div className="col-4">
                              <div className="text-danger fw-bold fs-4">{quizScore.total - quizScore.correct}</div>
                              <small className="text-muted">إجابات خاطئة</small>
                            </div>
                            <div className="col-4">
                              <div className={`fw-bold fs-3 ${quizScore.percentage >= 80 ? 'text-success' : quizScore.percentage >= 60 ? 'text-warning' : 'text-danger'}`}>
                                {quizScore.percentage}%
                              </div>
                              <small className="text-muted">النسبة المئوية</small>
                            </div>
                          </div>
                          
                          <div className="mt-2">
                            <div className={`badge ${quizScore.percentage >= 80 ? 'bg-success' : quizScore.percentage >= 60 ? 'bg-warning' : 'bg-danger'} fs-6`}>
                              {quizScore.percentage >= 80 ? 'ممتاز! 🎉' : 
                               quizScore.percentage >= 60 ? 'جيد 👍' : 
                               'يحتاج تحسين 📚'}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Regenerate Quiz Buttons - Only show when quiz is completed */}
                      {quizRevealed && (
                        <div className="text-center mt-3">
                          <div className="d-flex gap-2 justify-content-center flex-wrap">
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => {
                                if (onConfirmQuiz && message.quizSubject) {
                                  onConfirmQuiz({
                                    subject: message.quizSubject,
                                    questions: message.quizQuestions || questionsCount,
                                    answers: message.quizAnswers || answersCount,
                                    difficulties: message.quizDifficulties || selDifficulties,
                                    types: message.quizTypes || selTypes,
                                    timer: message.quizTimer || (timerEnabled ? timerMinutes : 0),
                                    hints: message.quizHints !== undefined ? message.quizHints : hintsEnabled,
                                    messageId: message.id
                                  })
                                }
                              }}
                              title="إنشاء اختبار جديد بنفس الموضوع والمعايير"
                            >
                              <i className="fas fa-redo me-1"></i>
                              اختبار جديد (نفس المعايير)
                            </button>
                            
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => {
                                // Show quiz confirmation with current parameters
                                if (message.quizSubject) {
                                  const confirmMsg = {
                                    id: Date.now(),
                                    sender: 'ai',
                                    text: `تأكيد: تحب نعملك اختبار (أسئلة متعددة الاختيارات) على: "${message.quizSubject}"؟`,
                                    timestamp: new Date(),
                                    isQuizConfirm: true,
                                    quizSubject: message.quizSubject,
                                    quizDefaultQuestions: message.quizQuestions || 5,
                                    quizDefaultAnswers: message.quizAnswers || 4
                                  }
                                  // Add the confirmation message
                                  const event = new CustomEvent('addQuizConfirmMessage', { detail: confirmMsg })
                                  window.dispatchEvent(event)
                                }
                              }}
                              title="إنشاء اختبار جديد مع إمكانية تغيير المعايير"
                            >
                              <i className="fas fa-cogs me-1"></i>
                              اختبار جديد (معايير مختلفة)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
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
              <input 
                type="number" 
                className={`form-control ${questionsCount < 2 || questionsCount > 40 ? 'is-invalid' : ''}`}
                value={questionsCount}
                onChange={(e) => setQuestionsCount(parseInt(e.target.value) || 2)}
                min={2} 
                max={40} 
                style={{ width: 90 }} 
              />
            </div>
            <div className="d-flex align-items-center gap-2">
              <label className="form-label m-0">عدد الخيارات</label>
              <input 
                type="number" 
                className={`form-control ${answersCount < 2 || answersCount > 5 ? 'is-invalid' : ''}`}
                value={answersCount}
                onChange={(e) => setAnswersCount(parseInt(e.target.value) || 2)}
                min={2} 
                max={5} 
                style={{ width: 90 }} 
              />
            </div>
            {/* Difficulties multi-select */}
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <label className="form-label m-0">الصعوبة</label>
              {['easy','medium','hard'].map(d => (
                <button
                  key={d}
                  type="button"
                  className={`btn btn-sm ${selDifficulties.includes(d) ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => {
                    const next = selDifficulties.includes(d) ? selDifficulties.filter(x=>x!==d) : [...selDifficulties, d]
                    setSelDifficulties(next.length ? next : selDifficulties) // prevent empty via UI; we'll still guard on Yes
                  }}
                >
                  {d==='easy'?'سهل':d==='medium'?'متوسط':'صعب'}
                </button>
              ))}
            </div>
            {/* Types multi-select */}
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <label className="form-label m-0">نوع الأسئلة</label>
              {[{k:'mcq',l:'اختيار واحد'}, {k:'mcma',l:'اختيارات متعددة'}, {k:'tf',l:'صح/غلط'}, {k:'fitb',l:'فراغ'}].map(({k,l}) => (
                <button
                  key={k}
                  type="button"
                  className={`btn btn-sm ${selTypes.includes(k) ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => {
                    const next = selTypes.includes(k) ? selTypes.filter(x=>x!==k) : [...selTypes, k]
                    setSelTypes(next.length ? next : selTypes)
                  }}
                >{l}</button>
              ))}
            </div>
            {/* Timer controls */}
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`timer-switch-${message.id}`}
                  checked={timerEnabled}
                  onChange={(e) => setTimerEnabled(e.target.checked)}
                />
                <label className="form-check-label" htmlFor={`timer-switch-${message.id}`}>
                  مؤقت
                </label>
              </div>
              {timerEnabled && (
                <div className="d-flex align-items-center gap-1">
                  <input
                    type="number"
                    className="form-control"
                    value={timerMinutes}
                    onChange={(e) => setTimerMinutes(Math.max(1, Math.min(60, parseInt(e.target.value || '10', 10))))}
                    min={1}
                    max={60}
                    style={{ width: 70 }}
                  />
                  <small className="text-muted">دقيقة</small>
                </div>
              )}
            </div>
            {/* Hints toggle */}
            <div className="d-flex align-items-center gap-2">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`hints-switch-${message.id}`}
                  checked={hintsEnabled}
                  onChange={(e) => setHintsEnabled(e.target.checked)}
                />
                <label className="form-check-label" htmlFor={`hints-switch-${message.id}`}>
                  تلميحات
                </label>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-success d-flex align-items-center gap-2"
              onClick={() => {
                const questions = Math.max(2, Math.min(40, questionsCount))
                const answers = Math.max(2, Math.min(5, answersCount))
                onConfirmQuiz && onConfirmQuiz({ 
                  subject: message.quizSubject || '', 
                  questions, 
                  answers, 
                  difficulties: selDifficulties, 
                  types: selTypes, 
                  timer: timerEnabled ? timerMinutes : null,
                  hints: hintsEnabled,
                  messageId: message.id 
                })
              }}
              disabled={
                !selDifficulties.length || 
                !selTypes.length || 
                quizGenerating ||
                questionsCount < 2 || questionsCount > 40 ||
                answersCount < 2 || answersCount > 5
              }
            >
              {quizGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>جاري إنشاء الاختبار...</span>
                </>
              ) : (
                <span>نعم، أنشئ الاختبار</span>
              )}
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
        {!message.isWelcomeMessage && !message.isPdfPreview && !message.isQuizConfirm && !message.isQuiz && !message.text?.includes('اختبار') && !message.text?.includes('أسئلة متعددة') && (
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
        {!message.isWelcomeMessage && !message.isPdfPreview && !message.isQuizConfirm && !message.isQuiz && !message.text?.includes('اختبار') && !message.text?.includes('أسئلة متعددة') && (
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
    </>
  )
}

export default ChatMessage
