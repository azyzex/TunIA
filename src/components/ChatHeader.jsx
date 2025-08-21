import React from 'react'
import { motion } from 'framer-motion'
import { Brain, Sparkles } from 'lucide-react'

const ChatHeader = () => {
  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass-effect fixed-top py-3 shadow-sm"
      style={{ zIndex: 1030 }}
    >
      <div className="container-fluid">
        <div className="row align-items-center">
          <div className="col">
            <div className="d-flex align-items-center">
              <div className="position-relative me-3">
                <Brain className="text-primary" size={32} />
                <Sparkles 
                  className="text-warning position-absolute" 
                  size={16}
                  style={{ top: '-4px', right: '-4px' }}
                />
              </div>
              <div>
                <h1 className="h3 mb-0 gradient-text fw-bold">TUNIA</h1>
                <small className="text-muted">مساعدك الأكاديمي بالدارجة التونسية</small>
              </div>
            </div>
          </div>
          <div className="col-auto">
            <div className="d-flex align-items-center">
              <div 
                className="bg-success rounded-circle me-2" 
                style={{ width: '8px', height: '8px', animation: 'pulse 2s infinite' }}
              ></div>
              <small className="text-muted">متصل</small>
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  )
}

export default ChatHeader
