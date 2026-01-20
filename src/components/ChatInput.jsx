import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Plus, FileText, X, Search, Image as ImageIcon, ListChecks } from 'lucide-react'

const ChatInput = ({ onSendMessage, disabled = false, quizMode = false, setQuizMode = () => {}, hasMessages = false }) => {
  const [inputText, setInputText] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const [combinedToolEnabled, setCombinedToolEnabled] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null) // { file, previewUrl, mimeType, base64 }
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)
  
  // Determine if input should be centered based on messages prop
  const isCentered = !hasMessages

  const handleSend = () => {
    // Allow sending in quiz mode if there's a PDF file (even without text)
    const hasContent = inputText.trim() || selectedFile || selectedImage;
    const canSendQuizWithPdf = quizMode && selectedFile && selectedFile.type === 'application/pdf';
    
    if (!hasContent && !canSendQuizWithPdf) return
    
    // Close tool menu when sending
    setToolMenuOpen(false);
    
    // Send message immediately
    onSendMessage({
      text: inputText,
      file: selectedFile,
      image: selectedImage ? { data: selectedImage.base64, mimeType: selectedImage.mimeType, previewUrl: selectedImage.previewUrl } : null,
      webSearch: combinedToolEnabled,
      fetchUrl: combinedToolEnabled,
      quizMode
    });
    
    setInputText('');
    setSelectedFile(null);
    setSelectedImage(null);
    
    // Reset file inputs
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
    
    // Keep combinedToolEnabled and quizMode persistent
  }

  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file && file.type === 'application/pdf') {
      // Allow PDF with quiz mode: selecting a file disables combined tool and image but keeps quiz mode
      setCombinedToolEnabled(false)
      setSelectedImage(null)
      if (imageInputRef.current) imageInputRef.current.value = ''
      // Don't disable quiz mode - PDF can be used for quiz generation
      setSelectedFile(file)
    }
  }

  const removeFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const toggleCombinedTool = () => {
    // Mutual exclusivity: enabling combined tool clears file selection and image
    if (!combinedToolEnabled) {
      setSelectedFile(null)
      setSelectedImage(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
    // Note: Quiz mode can coexist with combined tool for PDF+quiz functionality
    setCombinedToolEnabled(prev => !prev)
    setToolMenuOpen(false)
  }

  const openFilePicker = () => {
    // Only clear image when selecting PDF files (PDFs can work with quiz mode)
    setSelectedImage(null)
    if (imageInputRef.current) imageInputRef.current.value = ''
    setToolMenuOpen(false)
    fileInputRef.current?.click()
  }

  const openImagePicker = () => {
    // Mutual exclusivity: choosing image upload clears combined tool and file  
    setCombinedToolEnabled(false)
    setQuizMode(false) // Images don't work with quiz mode
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setToolMenuOpen(false)
    imageInputRef.current?.click()
  }

  const handleImageSelect = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    const allowed = ['image/jpeg','image/png','image/webp','image/jpg']
    if (!allowed.includes(file.type)) return
    // Create preview
    const previewUrl = URL.createObjectURL(file)
    // Read base64
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => {
        const result = r.result
        const comma = result.indexOf(',')
        resolve(comma >= 0 ? result.slice(comma+1) : result)
      }
      r.onerror = reject
      r.readAsDataURL(file)
    })
  // Mutual exclusivity: clear selected PDF and combined tool when selecting an image
  setCombinedToolEnabled(false)
  setQuizMode(false)
  setSelectedFile(null)
  if (fileInputRef.current) fileInputRef.current.value = ''
  setSelectedImage({ file, previewUrl, mimeType: file.type, base64 })
  }


  return (
    <>
      {/* Blur bottom bar to hide content below text zone - placed outside main container */}
      <div
        className="fixed-bottom w-100"
        style={{
          height: '60px',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 1025, // Higher than content but lower than text zone
          pointerEvents: 'none',
          left: 'var(--sidebar-width, 0px)',
          width: 'calc(100% - var(--sidebar-width, 0px))'
        }}
      ></div>

      <motion.div 
        initial={isCentered ? { y: 0, opacity: 0 } : { y: 20, opacity: 0 }}
        animate={isCentered ? 
          { y: 0, opacity: 1, transition: { duration: 0.4 } } : 
          { y: 0, opacity: 1, transition: { duration: 0.3 } }
        }
        layout // This enables automatic animation when props change
        className={isCentered ? "position-absolute" : "fixed-bottom mb-4"}
        style={{ 
          zIndex: 1030,
          width: 'calc(100% - var(--sidebar-width, 0px))',
          left: 'var(--sidebar-width, 0px)',
          padding: '0 16px',
          top: isCentered ? '35%' : 'auto',
          transform: isCentered ? 'translateY(-50%) scale(1)' : 'scale(1)',
          transformOrigin: 'center center'
        }}
      >
      {/* Welcome message - only shown when centered */}
      <AnimatePresence>
        {isCentered && (
          <motion.h2 
            className="text-center mb-4 fw-normal" 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            transition={{ delay: 0.2, duration: 0.5 }}
            style={{ 
              color: '#fff5ed', /* Using our light color from the palette */
              fontSize: '28px',
              textShadow: '0 1px 3px rgba(0,0,0,0.3)'
            }}
          >
            شنوة جديدك يا معلم
          </motion.h2>
        )}
      </AnimatePresence>
      
      <div className="container-fluid p-0">
        <div className="row justify-content-center g-0">
          <div className="col-12">
            {/* Selected File Display */}
            {selectedFile && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mb-3 p-3 rounded-3 d-flex align-items-center justify-content-between"
                style={{ 
                  backgroundColor: '#eee4dd', 
                  border: '1px solid #cec5bf',
                  borderRadius: '12px'
                }}
              >
                <div className="d-flex align-items-center">
                  <FileText size={20} style={{ color: '#ee6060' }} className="me-2" />
                  <div>
                    <div className="fw-medium" style={{ fontSize: '0.9rem', color: '#89837f' }}>
                      {selectedFile.name}
                    </div>
                    <small style={{ color: '#ee6060' }}>
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </small>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeFile}
                  className="btn btn-sm"
                  style={{ 
                    border: '1px solid #ee6060',
                    color: '#ee6060'
                  }}
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}

            {/* Input Bar - ChatGPT-like design */}
            <div className="position-relative">
              {/* Selected Image Display */}
              {selectedImage && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mb-3 p-2 rounded-3 d-flex align-items-center justify-content-between"
                  style={{ 
                    backgroundColor: '#eee4dd', 
                    border: '1px solid #cec5bf',
                    borderRadius: '12px'
                  }}
                >
                  <div className="d-flex align-items-center">
                    <img src={selectedImage.previewUrl} alt="selected" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} className="me-2" />
                    <div>
                      <div className="fw-medium" style={{ fontSize: '0.85rem', color: '#89837f' }}>
                        {selectedImage.file.name}
                      </div>
                      <small style={{ color: '#ee6060' }}>
                        {(selectedImage.file.size / 1024 / 1024).toFixed(2)} MB
                      </small>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedImage(null); if (imageInputRef.current) imageInputRef.current.value = '' }}
                    className="btn btn-sm"
                    style={{ 
                      border: '1px solid #ee6060',
                      color: '#ee6060'
                    }}
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
              
              {/* ChatGPT-like input with shadow */}
              <div className="rounded-pill d-flex align-items-center shadow" 
                   style={{ 
                     boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)', 
                     border: '1px solid #cec5bf', /* Darker border color */
                     overflow: 'visible',
                     width: '100%',
                     maxWidth: '733px',
                     margin: '0 auto',
                     backgroundColor: '#fff5ed' /* Light background from our palette */
                   }}>
                {/* Only Plus button on left */}
                <div className="d-flex align-items-center" style={{ padding: '8px 0 8px 16px', position: 'relative' }}>
                  <button
                    type="button"
                    className={`btn btn-sm rounded-circle ${toolMenuOpen ? 'bg-light' : ''}`}
                    onClick={() => setToolMenuOpen(v => !v)}
                    style={{ width: '32px', height: '32px', padding: '4px' }}
                    disabled={disabled}
                  >
                    <Plus size={18} />
                  </button>

                  {/* Dropdown menu with animation */}
                  <AnimatePresence>
                    {toolMenuOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2 }}
                        className="position-absolute rounded shadow-sm p-2" 
                        style={{ 
                          zIndex: 1030,
                          width: '200px',
                          left: 0,
                          bottom: 'calc(100% + 10px)',
                          backgroundColor: '#fff5ed',
                          border: '1px solid #cec5bf'
                        }}
                      >
                        <button 
                          className="dropdown-item d-flex align-items-center py-2" 
                          type="button" 
                          onClick={openFilePicker} 
                          disabled={disabled}
                          style={{ color: '#89837f', backgroundColor: 'transparent', border: 'none' }}
                        >
                          <FileText size={16} className="me-2" style={{ color: '#ee6060' }} />
                          رفع ملف PDF
                        </button>
                        <button 
                          className="dropdown-item d-flex align-items-center py-2" 
                          type="button" 
                          onClick={openImagePicker} 
                          disabled={disabled}
                          style={{ color: '#89837f', backgroundColor: 'transparent', border: 'none' }}
                        >
                          <ImageIcon size={16} className="me-2" style={{ color: '#ee6060' }} />
                          رفع صورة
                        </button>
                        {/** Web search option removed: always enabled server-side */}
                        <button 
                          className="dropdown-item d-flex align-items-center justify-content-between py-2" 
                          type="button" 
                          onClick={() => {
                            const next = !quizMode;
                            if (next) {
                              setCombinedToolEnabled(false);
                            }
                            setQuizMode(next);
                            setToolMenuOpen(false);
                          }} 
                          disabled={disabled}
                          style={{ color: '#89837f', backgroundColor: 'transparent', border: 'none' }}
                        >
                          <span className="d-flex align-items-center">
                            <ListChecks size={16} className="me-2" style={{ color: '#ee6060' }} />
                            إنشاء اختبار
                          </span>
                          {quizMode && <span className="badge rounded-pill" style={{ backgroundColor: '#ee6060' }}>مفعل</span>}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                {/* Text input */}
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder={
                    quizMode 
                      ? (selectedFile 
                          ? "اكتب موضوع الاختبار (اختياري - يمكنك الضغط على الإرسال مباشرة لإنشاء اختبار من الـ PDF)"
                          : "اكتب موضوع الاختبار أو حمّل ملف PDF")
                      : "اكتب سؤالك هنا..."
                  }
                  className="form-control border-0 flex-grow-1"
                  style={{ 
                    resize: 'none', 
                    boxShadow: 'none',
                    background: 'transparent',
                    minHeight: '48px', 
                    maxHeight: '120px',
                    paddingLeft: '8px',
                    paddingRight: '8px',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    fontSize: '14px',
                    textAlign: 'right', /* Right-aligned for Arabic text */
                    direction: 'rtl' /* Ensure proper RTL text flow */
                  }}
                  rows={1}
                  disabled={disabled}
                />
                
                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={disabled || (() => {
                    const hasContent = inputText.trim() || selectedFile || selectedImage;
                    const canSendQuizWithPdf = quizMode && selectedFile && selectedFile.type === 'application/pdf';
                    return !hasContent && !canSendQuizWithPdf;
                  })()}
                  className="btn d-flex align-items-center justify-content-center me-2"
                  style={{ 
                    width: '36px', 
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: disabled ? '#cec5bf' : '#ee6060', /* Main color from our palette */
                    color: 'white'
                  }}
                >
                  <Send size={18} />
                </button>
              </div>
              
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="d-none"
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={handleImageSelect}
              className="d-none"
            />
            <AnimatePresence>
              {/** Removed combinedToolEnabled notice: web search is always on */}
              {quizMode && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 small text-center"
                  style={{ color: '#ee6060' }}>
                  باش نعملك اختبار على الموضوع إلي كتبتو.
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="d-none"
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={handleImageSelect}
              className="d-none"
            />
          </div>
        </div>
      </div>
    </motion.div>
    </>
  )
}

export default ChatInput
