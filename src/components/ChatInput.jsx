import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Send, Upload, FileText, X } from 'lucide-react'

const ChatInput = ({ onSendMessage, disabled = false }) => {
  const [inputText, setInputText] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const fileInputRef = useRef(null)

  const handleSend = () => {
    if (!inputText.trim() && !selectedFile) return
    
    onSendMessage({
      text: inputText,
      file: selectedFile
    })
    
    setInputText('')
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
    }
  }

  const removeFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-link position-absolute text-muted p-0"
                  style={{ 
                    left: '12px', 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    width: '32px',
                    height: '32px'
                  }}
                  disabled={disabled}
                >
                  <Upload size={20} />
                </button>
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
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ChatInput
