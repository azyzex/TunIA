import React from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Upload, MessageCircle, Sparkles, Brain } from 'lucide-react'

const WelcomeScreen = ({ onStartChat }) => {
  const features = [
    {
      icon: MessageCircle,
      title: "محادثة بالدارجة",
      description: "تكلم معايا بالدارجة التونسية وبش نجاوبك بنفس اللغة"
    },
    {
      icon: BookOpen,
      title: "أسئلة أكاديمية",
      description: "اسأل على أي حاجة تخص الدراسة والبحوث الأكاديمية"
    },
    {
      icon: Upload,
      title: "تحليل PDF",
      description: "ارفع ملف PDF وبش نساعدك نفهمو ونلخصلك محتواه"
    }
  ]

  const sampleQuestions = [
    "علاش الخوارزميات مهمة في البرمجة؟",
    "كيفاش نحل مسألة رياضية معقدة؟",
    "شنوا أهم النظريات في الفيزياء؟",
    "كيفاش نكتب بحث أكاديمي متقن؟"
  ]

  return (
    <div className="min-vh-100 tunisian-bg d-flex align-items-center justify-content-center p-4">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          {/* Logo and Title */}
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-5"
          >
            <div className="position-relative d-inline-block mb-4">
              <Brain size={80} className="text-primary mx-auto" />
              <Sparkles 
                size={32} 
                className="text-warning position-absolute animate-pulse" 
                style={{ top: '-8px', right: '-8px' }}
              />
            </div>
            <h1 className="display-1 fw-bold gradient-text mb-4">TUNIA</h1>
            <p className="h4 text-muted">
              مساعدك الذكي للأسئلة الأكاديمية بالدارجة التونسية
            </p>
          </motion.div>

          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="row g-4 mb-5"
          >
            {features.map((feature, index) => (
              <div key={index} className="col-md-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.5 }}
                  className="feature-card p-4 h-100"
                >
                  <feature.icon size={48} className="text-primary mx-auto mb-3" />
                  <h5 className="fw-semibold text-dark mb-3" style={{ direction: 'rtl' }}>
                    {feature.title}
                  </h5>
                  <p className="text-muted small lh-base" style={{ direction: 'rtl' }}>
                    {feature.description}
                  </p>
                </motion.div>
              </div>
            ))}
          </motion.div>

          {/* Sample Questions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mb-5"
          >
            <h2 className="h4 fw-semibold text-dark mb-4" style={{ direction: 'rtl' }}>
              أمثلة على الأسئلة اللي تنجم تسأل عليها
            </h2>
            <div className="row g-3">
              {sampleQuestions.map((question, index) => (
                <div key={index} className="col-md-6">
                  <motion.button
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1 + index * 0.1, duration: 0.5 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onStartChat(question)}
                    className="question-btn w-100 btn text-start"
                  >
                    {question}
                  </motion.button>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Start Chat Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 0.6 }}
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onStartChat()}
              className="btn tunisian-primary text-white px-5 py-3 fs-5 fw-semibold shadow-lg"
              style={{ 
                borderRadius: '24px',
                border: 'none',
                direction: 'rtl'
              }}
            >
              ابدأ المحادثة الآن
            </motion.button>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.6 }}
            className="mt-5"
          >
            <p className="text-muted small" style={{ direction: 'rtl' }}>
              مدعوم بتقنية Gemini AI • مصمم خصيصاً للطلاب التونسيين
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

export default WelcomeScreen
