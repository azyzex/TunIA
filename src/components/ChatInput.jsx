import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Send, Upload, FileText, X, Plus, Search, Link as LinkIcon } from 'lucide-react'

const ChatInput = ({ onSendMessage, disabled = false }) => {
  const [inputText, setInputText] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [fetchUrlEnabled, setFetchUrlEnabled] = useState(false)
  const fileInputRef = useRef(null)

  const handleSend = () => {
    if (!inputText.trim() && !selectedFile) return
    
    onSendMessage({
      text: inputText,
      file: selectedFile,
      webSearch: webSearchEnabled,
      fetchUrl: fetchUrlEnabled
    })
    
    setInputText('')
    setSelectedFile(null)
    // Keep webSearchEnabled persistent - don't reset it
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file && file.type === 'application/pdf') {
      // Mutual exclusivity: selecting a file disables web search
  setWebSearchEnabled(false)
  setFetchUrlEnabled(false)
      setSelectedFile(file)
    }
  }

  const removeFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const toggleWebSearch = () => {
    // Mutual exclusivity: enabling web search clears file selection
    if (!webSearchEnabled) {
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  if (!webSearchEnabled) setFetchUrlEnabled(false)
  setWebSearchEnabled(prev => !prev)
    setToolMenuOpen(false)
  }

  const openFilePicker = () => {
    // Mutual exclusivity: choosing upload clears web search
    setWebSearchEnabled(false)
    setFetchUrlEnabled(false)
    setToolMenuOpen(false)
    fileInputRef.current?.click()
  }

  const toggleFetchUrl = () => {
    // Mutual exclusivity: enabling fetchUrl clears file and web search
    if (!fetchUrlEnabled) {
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setWebSearchEnabled(false)
    }
    setFetchUrlEnabled(prev => !prev)
    setToolMenuOpen(false)
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
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="اكتب سؤالك هنا بالدارجة التونسية..."
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
                        <button className="dropdown-item d-flex align-items-center" type="button" onClick={toggleWebSearch} disabled={disabled}>
                          <Search size={16} className="me-2" />
                          بحث على الويب {webSearchEnabled ? '✓' : ''}
                        </button>
                        <button className="dropdown-item d-flex align-items-center" type="button" onClick={toggleFetchUrl} disabled={disabled}>
                          <LinkIcon size={16} className="me-2" />
                          جلب محتوى رابط {fetchUrlEnabled ? '✓' : ''}
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
                disabled={disabled || (!inputText.trim() && !selectedFile)}
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
              disabled={webSearchEnabled || fetchUrlEnabled}
            />
            {webSearchEnabled && (
              <div className="mt-2 small text-primary">باش نخدم بحث على الويب (DuckDuckGo) للسؤال هذا.</div>
            )}
            {fetchUrlEnabled && (
              <div className="mt-2 small text-primary">اكتب رابط (http/https) في سؤالك وباش نجيبلو المحتوى متاعو.</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ChatInput
