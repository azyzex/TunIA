import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Send, Upload, FileText, X, Plus, Search, Image as ImageIcon, ListChecks } from 'lucide-react'

const ChatInput = ({ onSendMessage, disabled = false, quizMode = false, setQuizMode = () => {} }) => {
  const [inputText, setInputText] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const [combinedToolEnabled, setCombinedToolEnabled] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null) // { file, previewUrl, mimeType, base64 }
  // quizMode is lifted to App via props
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)

  const handleSend = () => {
    // Allow sending in quiz mode if there's a PDF file (even without text)
    const hasContent = inputText.trim() || selectedFile || selectedImage;
    const canSendQuizWithPdf = quizMode && selectedFile && selectedFile.type === 'application/pdf';
    
    if (!hasContent && !canSendQuizWithPdf) return
    
    onSendMessage({
      text: inputText,
      file: selectedFile,
  image: selectedImage ? { data: selectedImage.base64, mimeType: selectedImage.mimeType, previewUrl: selectedImage.previewUrl } : null,
      webSearch: combinedToolEnabled,
      fetchUrl: combinedToolEnabled,
      quizMode
    })
    
    setInputText('')
    setSelectedFile(null)
    setSelectedImage(null)
  // Keep combinedToolEnabled persistent - don't reset it
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
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
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass-effect fixed-bottom p-3 border-top"
      style={{ zIndex: 1020 }}
    >
      <div className="container-fluid">
        <div className="row justify-content-center">
          <div className="col-lg-8 col-xl-6">
            {/* Selected File Display */}
            {selectedFile && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mb-3 p-3 bg-light border border-primary rounded-3 d-flex align-items-center justify-content-between"
              >
                <div className="d-flex align-items-center">
                  <FileText size={20} className="text-primary me-2" />
                  <div>
                    <div className="fw-medium text-dark" style={{ fontSize: '0.9rem' }}>
                      {selectedFile.name}
                    </div>
                    <small className="text-primary">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </small>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeFile}
                  className="btn btn-sm btn-outline-primary"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}

            {/* Input Bar */}
            <div className="d-flex align-items-end gap-3">
              <div className="flex-grow-1 position-relative">
                {/* Selected Image Display */}
                {selectedImage && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="mb-3 p-2 bg-light border border-primary rounded-3 d-flex align-items-center justify-content-between"
                  >
                    <div className="d-flex align-items-center">
                      <img src={selectedImage.previewUrl} alt="selected" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} className="me-2" />
                      <div>
                        <div className="fw-medium text-dark" style={{ fontSize: '0.85rem' }}>
                          {selectedImage.file.name}
                        </div>
                        <small className="text-primary">
                          {(selectedImage.file.size / 1024 / 1024).toFixed(2)} MB
                        </small>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedImage(null); if (imageInputRef.current) imageInputRef.current.value = '' }}
                      className="btn btn-sm btn-outline-primary"
                    >
                      <X size={16} />
                    </button>
                  </motion.div>
                )}
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
                      : "اكتب سؤالك هنا بالدارجة التونسية..."
                  }
                  className="form-control chat-input border-0 shadow-sm"
                  style={{ 
                    resize: 'none', 
                    minHeight: '48px', 
                    maxHeight: '128px',
                    paddingLeft: '50px',
                    borderRadius: '24px'
                  }}
                  rows={1}
                  disabled={disabled}
                />
                <div
                  className="position-absolute"
                  style={{ left: '8px', top: '50%', transform: 'translateY(-50%)' }}
                >
                  <div className="dropdown dropup">
                    <button
                      type="button"
                      className="btn btn-link text-muted p-0 dropdown-toggle"
                      onClick={() => setToolMenuOpen(v => !v)}
                      aria-expanded={toolMenuOpen}
                      disabled={disabled}
                      style={{ width: '32px', height: '32px' }}
                    >
                      <Plus size={20} />
                    </button>
                    {toolMenuOpen && (
                      <div
                        className="dropdown-menu show"
                        style={{ minWidth: '200px', top: 'auto', bottom: '110%' }}
                      >
                        <button className="dropdown-item d-flex align-items-center" type="button" onClick={openFilePicker} disabled={disabled}>
                          <Upload size={16} className="me-2" />
                          رفع ملف PDF
                        </button>
                        <button className="dropdown-item d-flex align-items-center" type="button" onClick={openImagePicker} disabled={disabled}>
                          <ImageIcon size={16} className="me-2" />
                          رفع صورة
                        </button>
                        <button className="dropdown-item d-flex align-items-center" type="button" onClick={toggleCombinedTool} disabled={disabled}>
                          <Search size={16} className="me-2" />
                          بحث الويب + جلب الرابط {combinedToolEnabled ? '✓' : ''}
                        </button>
                        <button className="dropdown-item d-flex align-items-center" type="button" onClick={() => {
                          // Allow quiz mode to work with other tools (especially PDF upload)
                          const next = !quizMode
                          if (next) {
                            // Only clear web search when enabling quiz mode
                            // Keep PDF files and images as they can be used for quiz generation
                            setCombinedToolEnabled(false)
                          }
                          setQuizMode(next)
                          setToolMenuOpen(false)
                        }} disabled={disabled}>
                          <ListChecks size={16} className="me-2" />
                          إنشاء اختبار {quizMode ? '✓' : ''}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <motion.button
                whileHover={{ scale: disabled ? 1 : 1.05 }}
                whileTap={{ scale: disabled ? 1 : 0.95 }}
                onClick={handleSend}
                disabled={disabled || (() => {
                  const hasContent = inputText.trim() || selectedFile || selectedImage;
                  const canSendQuizWithPdf = quizMode && selectedFile && selectedFile.type === 'application/pdf';
                  return !hasContent && !canSendQuizWithPdf;
                })()}
                className="btn tunisian-primary text-white shadow-sm d-flex align-items-center justify-content-center"
                style={{ 
                  width: '48px', 
                  height: '48px',
                  borderRadius: '24px',
                  border: 'none'
                }}
              >
                <Send size={20} />
              </motion.button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="d-none"
              disabled={combinedToolEnabled}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={handleImageSelect}
              className="d-none"
              disabled={combinedToolEnabled}
            />
            {combinedToolEnabled && (
              <div className="mt-2 small text-primary">باش نخدم بحث على الويب ونجيب محتوى أي رابط تكتبّو في سؤالك.</div>
            )}
            {quizMode && (
              <div className="mt-2 small text-primary">باش نعملك اختبار (أسئلة متعددة الخيارات) على الموضوع إلي كتبتو.</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ChatInput
