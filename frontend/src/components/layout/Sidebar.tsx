import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  HelpCircle,
  ChevronRight,
  Zap,
  Star,
  LogOut,
  MoreVertical,
  Trash2,
  Mic,
  MessageCircle,
  Settings,
  Image as ImageIcon
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore, type Conversation } from '../../store/chat.store';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './Sidebar.module.css';
import { PanelLeft } from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, setIsCollapsed, onOpenSettings }) => {
  const { user, signOut } = useAuthStore();
  const { 
    conversations, 
    activeConversation, 
    fetchConversations, 
    setActiveConversation,
    clearActiveConversation,
    deleteConversation,
    loading 
  } = useChatStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  useEffect(() => {
    if (user?.id) {
      fetchConversations(user.id);
    }
  }, [user?.id, fetchConversations]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = () => {
      setMenuOpenId(null);
    };

    if (menuOpenId) {
      window.addEventListener('click', handleClickOutside);
    }

    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [menuOpenId]);

  const isVoiceContext = location.pathname.startsWith('/voice');

  const handleNewChat = () => {
    clearActiveConversation();
    if (isVoiceContext) {
      navigate('/voice');
    } else {
      navigate('/chat');
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversation(id);
    const conv = conversations.find(c => c.id === id);
    if (conv?.type === 'image') navigate('/images');
    else navigate(`/chat/${id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this conversation?')) {
      await deleteConversation(id);
      setMenuOpenId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const groupConversationsByDate = (convs: Conversation[]) => {
    const groups: { [key: string]: Conversation[] } = {
      'Today': [],
      'Yesterday': [],
      'Previous Days': []
    };

    convs.forEach(c => {
      const label = formatDate(c.created_at);
      if (label === 'Today') groups['Today'].push(c);
      else if (label === 'Yesterday') groups['Yesterday'].push(c);
      else groups['Previous Days'].push(c);
    });

    return groups;
  };

  const chatConversations = conversations.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase());
    return (c.type === 'chat' || !c.type) && matchesSearch;
  });

  const voiceConversations = conversations.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase());
    return c.type === 'voice' && matchesSearch;
  });
  
  const imageConversations = conversations.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase());
    return c.type === 'image' && matchesSearch;
  });

  const renderList = (items: Conversation[]) => {
    const groups = groupConversationsByDate(items);
    
    return Object.entries(groups).map(([label, groupItems]) => {
      if (groupItems.length === 0) return null;
      
      return (
        <div key={label} className={styles.dateGroup}>
          {!isCollapsed && <div className={styles.dateLabel}>{label}</div>}
          <div className={styles.historyList}>
            {groupItems.map((item) => (
              <div key={item.id} className={styles.historyItemWrapper}>
                <div 
                  className={`${styles.historyItem} ${activeConversation?.id === item.id ? styles.active : ''}`}
                  onClick={() => handleSelectConversation(item.id)}
                  title={isCollapsed ? item.title : undefined}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleSelectConversation(item.id);
                    }
                  }}
                >
                  {item.type === 'voice' ? <Mic size={18} className={styles.itemIcon} /> : 
                   item.type === 'image' ? <ImageIcon size={18} className={styles.itemIcon} /> : 
                   <MessageSquare size={18} className={styles.itemIcon} />}
                  {!isCollapsed && (
                    <>
                      <span className={styles.itemTitle}>{item.title}</span>
                      <button 
                        className={styles.menuBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === item.id ? null : item.id);
                        }}
                      >
                        <MoreVertical size={14} />
                      </button>
                    </>
                  )}
                </div>
                
                {menuOpenId === item.id && (
                  <div className={styles.dropdown}>
                    <button 
                      className={`${styles.menuAction} ${styles.deleteAction}`}
                      onClick={(e) => handleDelete(e, item.id)}
                    >
                      <Trash2 size={14} />
                      <span>Delete Chat</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    });
  };

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.topSection}>
        <div className={styles.topHeader}>
          {!isCollapsed && <span className={styles.brand}>CORE</span>}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={styles.toggleBtn}
          >
            <PanelLeft size={20} />
          </button>
        </div>

        <button className={styles.newChatBtn} onClick={handleNewChat} title={isVoiceContext ? "New Conversation" : "New Chat"}>
          <Plus size={22} strokeWidth={2.5} />
          {!isCollapsed && (
            <>
              <span style={{ marginLeft: '4px' }}>{isVoiceContext ? "New Conversation" : "New Chat"}</span>
              <div className={styles.cmd}>⌘K</div>
            </>
          )}
        </button>

        {!isCollapsed && (
          <div className={styles.searchWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input 
              type="text" 
              placeholder={isVoiceContext ? "Search library..." : "Search history..."} 
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className={styles.historySection}>
        {!isVoiceContext ? (
          <>
            <div className={styles.typeSection}>
              {!isCollapsed && (
                <div className={styles.typeTitle}>
                  <MessageCircle size={16} />
                  <span>Chat History</span>
                </div>
              )}
              {loading && conversations.length === 0 ? (
                <div className={styles.loadingState}>Loading...</div>
              ) : chatConversations.length === 0 ? (
                !isCollapsed && <div className={styles.emptyState}>No chats yet</div>
              ) : renderList(chatConversations)}
            </div>

            <div className={styles.typeSection}>
              {!isCollapsed && voiceConversations.length > 0 && (
                <div className={styles.typeTitle}>
                  <Mic size={16} />
                  <span>Voice Conversations</span>
                </div>
              )}
              {renderList(voiceConversations)}
            </div>

            <div className={styles.typeSection}>
              {!isCollapsed && imageConversations.length > 0 && (
                <div className={styles.typeTitle}>
                  <ImageIcon size={16} />
                  <span>Image Gallery</span>
                </div>
              )}
              {renderList(imageConversations)}
            </div>
          </>
        ) : (
          <div className={styles.typeSection}>
            {!isCollapsed && (
              <div className={styles.typeTitle}>
                <Mic size={16} />
                <span>Voice Conversations</span>
              </div>
            )}
            {loading && conversations.length === 0 ? (
              <div className={styles.loadingState}>Loading...</div>
            ) : voiceConversations.length === 0 ? (
              !isCollapsed && <div className={styles.emptyState}>No recordings yet</div>
            ) : renderList(voiceConversations)}
          </div>
        )}
      </div>

      <div className={styles.bottomSection}>
        <button className={styles.bottomLink} onClick={onOpenSettings} title="Settings">
          <Settings size={20} />
          {!isCollapsed && (
            <>
              <span>Settings</span>
              <ChevronRight size={14} className={styles.arrow} />
            </>
          )}
        </button>

        <button className={styles.bottomLink} title="Help & Support">
          <HelpCircle size={20} />
          {!isCollapsed && (
            <>
              <span>Help & Support</span>
              <ChevronRight size={14} className={styles.arrow} />
            </>
          )}
        </button>

        <div className={styles.profileCard}>
          <div className={styles.profileInfo}>
            <div className={styles.avatar}>
              <div className={styles.status} />
              {user?.email?.[0].toUpperCase()}
            </div>
            <div className={styles.details}>
              <span className={styles.name}>{user?.email?.split('@')[0]}</span>
              <div className={styles.badge}>
                <Zap size={10} fill="currentColor" />
                <span>{user?.plan_type === 'pro' ? 'Pro Member' : user?.plan_type === 'premium' ? 'Premium Member' : 'Free Plan'}</span>
              </div>
            </div>
          </div>
          <div className={styles.profileActions}>
            <button className={styles.signOutBtn} onClick={handleSignOut} title="Sign Out">
              <LogOut size={16} />
            </button>
            {user?.plan_type !== 'pro' && (
              <button className={styles.upgradeBtn} onClick={onOpenSettings}>
                <Star size={14} />
                <span>Upgrade</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
