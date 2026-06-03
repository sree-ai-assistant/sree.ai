import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface Conversation {
  id: string;
  user_id?: string;
  anon_id?: string;
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
  fetchConversations: (userId?: string, anonId?: string) => Promise<void>;
  setActiveConversation: (conversationId: string | null) => Promise<boolean>;
  createConversation: (userId: string | undefined, title: string, type?: 'chat' | 'voice' | 'image', anonId?: string, customId?: string) => Promise<Conversation | null>;
  deleteConversation: (conversationId: string) => Promise<void>;
  addMessage: (conversationId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: any) => Promise<Message | null>;
  updateMessage: (messageId: string, content: string, metadata?: any) => Promise<void>;
  removeMessage: (messageId: string) => Promise<void>;
  removeLastMessage: () => void;
  truncateHistory: (conversationId: string, fromMessageId: string) => Promise<void>;
  clearActiveConversation: () => void;
  setMessages: (messages: Message[]) => void;
  clearStore: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  loading: false,

  fetchConversations: async (userId?: string, anonId?: string) => {
    if (!userId && !anonId) return;
    set({ loading: true });

    let query = supabase
      .from('conversations')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    } else if (anonId) {
      query = query.eq('anon_id', anonId);
    }

    const { data } = await query.order('updated_at', { ascending: false });

    set({ conversations: data || [], loading: false });
  },

  setMessages: (messages: Message[]) => set({ messages }),

  setActiveConversation: async (conversationId: string | null) => {
    if (!conversationId) {
      set({ activeConversation: null, messages: [] });
      return true;
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
        return false;
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
      return true;
    }

    if (msgError) {
      console.error('Error fetching messages:', msgError);
    }

    // Filter out messages that have error metadata to ensure they don't persist on refresh
    const cleanMessages = (messages || []).filter(m => !m.metadata?.error || m.metadata?.aborted);

    // Keep local optimistic messages (e.g. temp_user_ or temp_assistant_) to prevent them disappearing during loading
    const localOptimisticMessages = get().messages.filter(m => m.id.startsWith('temp_'));

    // Merge them, avoiding duplicates
    const mergedMessages = [...cleanMessages];
    for (const localMsg of localOptimisticMessages) {
      const isAlreadyIncluded = mergedMessages.some(m => 
        m.id === localMsg.id || 
        (m.metadata?.optimisticId && m.metadata?.optimisticId === localMsg.metadata?.optimisticId)
      );
      if (!isAlreadyIncluded) {
        mergedMessages.push(localMsg);
      }
    }

    set({ messages: mergedMessages, loading: false });
    return true;
  },

  createConversation: async (userId: string | undefined, title: string, type: 'chat' | 'voice' | 'image' = 'chat', anonId?: string, customId?: string) => {
    const insertData: any = { title, type };
    if (customId) insertData.id = customId;
    if (userId) insertData.user_id = userId;
    if (anonId) insertData.anon_id = anonId;

    const attemptCreate = async () => {
      const { data, error } = await supabase
        .from('conversations')
        .insert([insertData])
        .select()
        .single();
      return { data, error };
    };

    let result = await attemptCreate();
    if (result.error) {
      console.warn('Conversation create failed, refreshing session and retrying:', result.error.message);
      try {
        await supabase.auth.refreshSession();
      } catch (_) { /* ignore refresh errors */ }
      result = await attemptCreate();
    }

    if (result.error) {
      console.error('Error creating conversation:', result.error);
      return null;
    }

    set(state => ({
      conversations: [result.data, ...state.conversations.filter(c => c.id !== result.data.id)],
      activeConversation: result.data,
      messages: state.messages.length > 0 ? state.messages : []
    }));

    return result.data;
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

      const exists = state.messages.some(m => m.id === optimisticId || (m.metadata?.optimisticId && m.metadata.optimisticId === optimisticId));
      const newMessages = exists 
        ? state.messages.map(m => (m.id === optimisticId || (m.metadata?.optimisticId && m.metadata.optimisticId === optimisticId)) ? { ...m, conversation_id: conversationId } : m)
        : [...state.messages, tempMessage];

      return {
        messages: newMessages,
        conversations: updatedConversations
      };
    });

    // 2. Persist to DB (with retry on RLS/auth failures)
    let persistedData: any = null;
    let persistError: any = null;

    const attemptInsert = async () => {
      const { data, error } = await supabase
        .from('messages')
        .insert([{ conversation_id: conversationId, role, content, metadata: { ...metadata, optimisticId } }])
        .select()
        .single();
      return { data, error };
    };

    const result = await attemptInsert();
    if (result.error) {
      console.warn('Message insert failed, refreshing session and retrying:', result.error.message);
      // Refresh session and retry once — handles expired tokens / RLS issues
      try {
        await supabase.auth.refreshSession();
      } catch (_) { /* ignore refresh errors */ }
      const retry = await attemptInsert();
      if (retry.error) {
        persistError = retry.error;
        console.error('Message insert failed after retry:', retry.error);
      } else {
        persistedData = retry.data;
      }
    } else {
      persistedData = result.data;
    }

    if (persistError) {
      // Instead of rolling back and returning null (which kills the chat flow),
      // keep the optimistic message so the AI request can still proceed.
      // The backend uses supabaseAdmin (service_role) for its own message operations.
      console.warn('Keeping optimistic message despite DB error — chat flow will continue.');
      
      // Update conversation timestamp in background (best effort)
      supabase
        .from('conversations')
        .update({ updated_at: now })
        .eq('id', conversationId)
        .then(({ error }) => {
          if (error) console.error('Error updating conversation timestamp:', error);
        });

      return tempMessage;
    }

    // 3. Replace temp message with real one, preserving the optimisticId for stable React keys
    const finalMessage = {
      ...persistedData,
      metadata: { ...persistedData.metadata, optimisticId }
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
  },

  clearStore: () => {
    set({ conversations: [], activeConversation: null, messages: [], loading: false });
  }
}));
