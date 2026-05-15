import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  type: 'chat' | 'voice' | 'image';
  created_at: string;
  updated_at: string;
  videos_in_conversation?: { name: string; url: string }[];
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
  created_at: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  
  // Actions
  fetchConversations: (userId: string) => Promise<void>;
  setActiveConversation: (conversationId: string | null) => Promise<void>;
  createConversation: (userId: string, title: string, type?: 'chat' | 'voice' | 'image') => Promise<Conversation | null>;
  deleteConversation: (conversationId: string) => Promise<void>;
  addMessage: (conversationId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: any) => Promise<Message | null>;
  updateMessage: (messageId: string, content: string, metadata?: any) => Promise<void>;
  removeMessage: (messageId: string) => Promise<void>;
  removeLastMessage: () => void;
  truncateHistory: (conversationId: string, fromMessageId: string) => Promise<void>;
  clearActiveConversation: () => void;
  setMessages: (messages: Message[]) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  loading: false,

  fetchConversations: async (userId: string) => {
    set({ loading: true });
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    set({ conversations: data || [], loading: false });
  },

  setMessages: (messages: Message[]) => set({ messages }),
  
  setActiveConversation: async (conversationId: string | null) => {
    if (!conversationId) {
      set({ activeConversation: null, messages: [] });
      return;
    }

    set({ loading: true });

    // Try to find in local state first
    let conv = get().conversations.find(c => c.id === conversationId);

    // If not in local state, fetch from DB (Deep linking support)
    if (!conv) {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();
      
      if (error || !data) {
        console.error('Conversation not found:', error);
        set({ activeConversation: null, messages: [], loading: false });
        return;
      }
      conv = data;
      
      // Add to local conversations list if not present
      set(state => ({
        conversations: [conv!, ...state.conversations.filter(c => c.id !== conversationId)],
        activeConversation: conv
      }));
    } else {
      set({ activeConversation: conv });
    }

    // Fetch messages for this conversation, filtering out saved error messages
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    // Race condition check: only update if this is still the active conversation
    if (get().activeConversation?.id !== conversationId) {
      return;
    }

    if (msgError) {
      console.error('Error fetching messages:', msgError);
    }
    
    // Filter out messages that have error metadata to ensure they don't persist on refresh
    const cleanMessages = (messages || []).filter(m => !m.metadata?.error || m.metadata?.aborted);
    
    set({ messages: cleanMessages, loading: false });
  },

  createConversation: async (userId: string, title: string, type: 'chat' | 'voice' | 'image' = 'chat') => {
    const { data, error } = await supabase
      .from('conversations')
      .insert([{ user_id: userId, title, type }])
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return null;
    }

    set(state => ({
      conversations: [data, ...state.conversations],
      activeConversation: data,
      messages: []
    }));

    return data;
  },

  deleteConversation: async (conversationId: string) => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) {
      console.error('Error deleting conversation:', error);
      return;
    }

    set(state => ({
      conversations: state.conversations.filter(c => c.id !== conversationId),
      activeConversation: state.activeConversation?.id === conversationId ? null : state.activeConversation,
      messages: state.activeConversation?.id === conversationId ? [] : state.messages
    }));
  },

  addMessage: async (conversationId: string, role: 'user' | 'assistant' | 'system', content: string, metadata: any = {}) => {
    const optimisticId = metadata.optimisticId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const tempMessage: Message = {
      id: optimisticId,
      conversation_id: conversationId,
      role,
      content,
      metadata: { ...metadata, optimisticId },
      created_at: now
    };

    // 1. Optimistic Update
    set(state => {
      const updatedConversations = [...state.conversations];
      const convIndex = updatedConversations.findIndex(c => c.id === conversationId);
      
      if (convIndex !== -1) {
        const updatedConv = { ...updatedConversations[convIndex], updated_at: now };
        updatedConversations.splice(convIndex, 1);
        updatedConversations.unshift(updatedConv);
      }

      return {
        messages: [...state.messages, tempMessage],
        conversations: updatedConversations
      };
    });

    // 2. Persist to DB
    const { data, error } = await supabase
      .from('messages')
      .insert([{ conversation_id: conversationId, role, content, metadata: { ...metadata, optimisticId } }])
      .select()
      .single();

    if (error) {
       console.error('Error adding message:', error);
       // Rollback on error
       set(state => ({
         messages: state.messages.filter(m => m.id !== optimisticId)
       }));
       return null;
    }

    // 3. Replace temp message with real one, preserving the optimisticId for stable React keys
    const finalMessage = { 
      ...data, 
      metadata: { ...data.metadata, optimisticId } 
    };

    set(state => ({
      messages: state.messages.map(m => m.id === optimisticId ? finalMessage : m)
    }));

    // Update conversation timestamp in background
    supabase
      .from('conversations')
      .update({ updated_at: now })
      .eq('id', conversationId)
      .then(({ error }) => {
        if (error) console.error('Error updating conversation timestamp:', error);
      });

    return finalMessage;
  },

  updateMessage: async (messageId: string, content: string, metadata?: any) => {
    const currentMessage = get().messages.find(m => m.id === messageId);
    const newMetadata = metadata ? { ...(currentMessage?.metadata || {}), ...metadata } : currentMessage?.metadata;
    
    const updateData: any = { content };
    if (newMetadata) updateData.metadata = newMetadata;

    const { error } = await supabase
      .from('messages')
      .update(updateData)
      .eq('id', messageId);

    if (error) {
      console.error('Error updating message:', error);
      return;
    }

    set(state => ({
      messages: state.messages.map(m => m.id === messageId ? { ...m, content, metadata: newMetadata } : m),
    }));
  },

  removeMessage: async (messageId: string) => {
    // Optimistic update
    const previousMessages = get().messages;
    set(state => ({
      messages: state.messages.filter(m => m.id !== messageId)
    }));

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      console.error('Error removing message:', error);
      // Rollback on error
      set({ messages: previousMessages });
      return;
    }
  },

  removeLastMessage: () => {
    set(state => ({
      messages: state.messages.slice(0, -1)
    }));
  },

  truncateHistory: async (conversationId: string, fromMessageId: string, exclusive: boolean = false) => {
    const messages = get().messages;
    const targetMsg = messages.find(m => m.id === fromMessageId);
    if (!targetMsg) return;

    // 1. Permanent deletion from DB for this conversation from this timestamp onwards
    // Using created_at ensures we catch messages that might have been filtered out of the local state
    const query = supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);
    
    if (exclusive) {
      query.gt('created_at', targetMsg.created_at);
    } else {
      query.gte('created_at', targetMsg.created_at);
    }

    const { error } = await query;

    if (error) {
      console.error('Error truncating history:', error);
    }

    // 2. Local state update (optimistic)
    const index = messages.findIndex(m => m.id === fromMessageId);
    if (index !== -1) {
      set(state => ({
        messages: state.messages.slice(0, exclusive ? index + 1 : index)
      }));
    }
  },

  clearActiveConversation: () => {
    set({ activeConversation: null, messages: [] });
  }
}));
