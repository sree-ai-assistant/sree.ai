import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Wand2, Trash2, Loader2, Sparkles, Clock } from 'lucide-react';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const ImageGenPage: React.FC = () => {
  const { user } = useAuthStore();
  const { conversations, fetchConversations, createConversation, addMessage, deleteConversation, loading } = useChatStore();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchConversations(user.id);
    }
  }, [user?.id, fetchConversations]);

  const imageHistory = conversations
    .filter(c => c.type === 'image')
    .map(c => ({
      id: c.id,
      title: c.title,
      // We'll store the URL in the first assistant message for this conversation
      // In a real app, we might have a separate table or metadata, but this fits the current schema
      url: '', 
      created_at: c.created_at
    }));

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating || !user?.id) return;

    setIsGenerating(true);
    try {
      const response = await api.post('/ai/image', {
        prompt,
        model: 'stabilityai/stable-diffusion-xl-base-1.0'
      });

      if (response.data.success) {
        const url = response.data.data.data[0].url;
        
        // 1. Create a conversation entry
        const newConv = await createConversation(user.id, prompt.slice(0, 30) + '...', 'image');
        if (newConv) {
          // 2. Add the URL as an assistant message
          await addMessage(newConv.id, 'assistant', url);
          // 3. Add the prompt as a user message
          await addMessage(newConv.id, 'user', prompt);
          // Navigate to the image session
          navigate(`/images/${newConv.id}`);
        }
        
        setPrompt('');
      }
    } catch (error: any) {
      console.error('Image Generation Error:', error);
      alert(error.response?.data?.message || 'Failed to generate image. Ensure your NVIDIA API key is valid.');
    } finally {
      setIsGenerating(false);
    }
  };

  // We need to fetch the actual image URLs for the gallery
  // Since our messages are fetched when a conversation is ACTIVE, 
  // and here we want to see ALL images, we might need a specialized fetch 
  // or store the URL in the conversation title/metadata.
  // For now, let's assume we'll just show the latest ones or the user has to click.
  // Actually, let's make it better: 
  // We'll update the ChatStore to allow fetching messages for multiple convs or just use a dedicated gallery page.
  
  // SIMPLIFICATION: We'll just display the list and let them click, 
  // OR we can do a quick check if conversations have the URL.
  
  return (
    <DashboardLayout>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '32px' }}>
          <h2 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '8px' }}>Vision Engine</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Transform your thoughts into high-fidelity visual art.</p>
        </div>

        <div className="glass" style={{ padding: '24px', borderRadius: '24px', marginBottom: '40px' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="chat-input-wrapper" style={{ margin: 0, flex: 1 }}>
              <ImageIcon size={20} color="var(--text-muted)" style={{ marginLeft: '8px' }} />
              <input
                className="chat-input"
                placeholder="Describe the image you want to create..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              />
            </div>
            <button 
              className="send-btn" 
              style={{ width: 'auto', padding: '0 24px', display: 'flex', gap: '8px' }}
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
            >
              {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
              Generate
            </button>
          </div>
        </div>

        {imageHistory.length === 0 && !isGenerating && !loading && (
          <div style={{ textAlign: 'center', marginTop: '60px', opacity: 0.5 }}>
            <Sparkles size={48} color="var(--primary)" style={{ marginBottom: '16px' }} />
            <h3>Your gallery is empty</h3>
            <p>Try prompting something like "A cyberpunk city at night with neon rain"</p>
          </div>
        )}

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
          gap: '24px' 
        }}>
          {loading && imageHistory.length === 0 ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={`img-skeleton-${i}`} className="skeleton" style={{ aspectRatio: '1/1', borderRadius: '20px' }}></div>
            ))
          ) : (
            <AnimatePresence>
              {isGenerating && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass"
                  style={{ 
                    aspectRatio: '1/1', 
                    borderRadius: '20px', 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '16px',
                    border: '1px dashed var(--primary)'
                  }}
                >
                  <div className="animate-spin">
                    <Loader2 size={40} color="var(--primary)" />
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>Synthesizing Vision...</p>
                </motion.div>
              )}

              {imageHistory.map(img => (
                <motion.div
                  key={img.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="glass glow-border"
                  style={{ 
                    position: 'relative', 
                    borderRadius: '20px', 
                    overflow: 'hidden', 
                    cursor: 'pointer',
                    minHeight: '200px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <div style={{ padding: '20px', textAlign: 'center' }}>
                      <Clock size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                      <p style={{ fontSize: '0.85rem' }}>{img.title}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {new Date(img.created_at).toLocaleDateString()}
                      </p>
                  </div>
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                    opacity: 0,
                    transition: 'opacity 0.3s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    padding: '16px'
                  }} 
                  className="gallery-overlay"
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                  >
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button style={{ 
                         background: 'rgba(239, 68, 68, 0.2)', 
                         border: 'none', 
                         color: '#EF4444', 
                         width: '100%',
                         height: '32px',
                         borderRadius: '8px',
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                         gap: '8px'
                      }} onClick={(e) => {
                          e.stopPropagation();
                          if(confirm('Delete this generation?')) deleteConversation(img.id);
                      }}>
                        <Trash2 size={14} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
};

export default ImageGenPage;
