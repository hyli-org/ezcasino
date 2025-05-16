import React, { useState, useRef, useEffect } from 'react';
import './MsnChat.css';

interface MsnChatProps {
  onClose: () => void;
}

interface Contact {
  id: string;
  name: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  avatar: string;
  email?: string;
}

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  isOwn: boolean;
}

interface ChatWindow {
  contact: Contact;
  position: { x: number, y: number };
  messages: Message[];
  isMinimized: boolean;
}

// ChatWindow component for individual chat windows
const ChatWindow: React.FC<{
  chatWindow: ChatWindow;
  onClose: (contactId: string) => void;
  onMessageSend: (contactId: string, message: string) => void;
  onPositionChange: (contactId: string, position: { x: number, y: number }) => void;
  onMinimize: (contactId: string) => void;
}> = ({ chatWindow, onClose, onMessageSend, onPositionChange, onMinimize }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [inputMessage, setInputMessage] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const { contact, position, messages, isMinimized } = chatWindow;

  // Add window-level event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('.win95-title-bar')) {
      setIsDragging(true);
      const rect = e.currentTarget.getBoundingClientRect();
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Keep window within viewport
      const maxX = window.innerWidth - 400; // Window width
      const maxY = window.innerHeight - 500; // Window height
      
      onPositionChange(contact.id, {
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleSendMessage = () => {
    if (inputMessage.trim() === '') return;
    onMessageSend(contact.id, inputMessage);
    setInputMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  if (isMinimized) {
    return null;
  }

  return (
    <div 
      className="msn-win95-window"
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'default',
        width: '400px',
        height: '400px'
      }}
      ref={chatWindowRef}
      onMouseDown={handleMouseDown}
    >
      <div className="win95-title-bar">
        <span>Chat with {contact.name}</span>
        <div className="window-controls">
          <button className="minimize" onClick={() => onMinimize(contact.id)}>-</button>
          <button className="maximize">□</button>
          <button className="close" onClick={() => onClose(contact.id)}>×</button>
        </div>
      </div>

      <div className="menu-bar">
        <div className="menu-item" onClick={toggleMenu} style={{ position: 'relative' }}>
          File
          {showMenu && (
            <div className="menu-dropdown">
              <div className="menu-option" onClick={() => onClose(contact.id)}>
                Close Chat
              </div>
            </div>
          )}
        </div>
        <span className="menu-item">Edit</span>
        <span className="menu-item">Actions</span>
        <span className="menu-item">Tools</span>
        <span className="menu-item">Help</span>
      </div>
      
      <div className="msn-toolbar">
        <div className="msn-tool">
          <img src="/chat-icons/invite-icon.svg" alt="Invite" className="tool-icon" />
          <div className="tool-label">Invite</div>
        </div>
        <div className="msn-tool">
          <img src="/chat-icons/files-icon.svg" alt="Send Files" className="tool-icon" />
          <div className="tool-label">Send Files</div>
        </div>
        <div className="msn-tool">
          <img src="/chat-icons/video-icon.svg" alt="Video" className="tool-icon" />
          <div className="tool-label">Video</div>
        </div>
        <div className="msn-tool">
          <img src="/chat-icons/voice-icon.svg" alt="Voice" className="tool-icon" />
          <div className="tool-label">Voice</div>
        </div>
        <div className="msn-tool">
          <img src="/chat-icons/activities-icon.svg" alt="Activities" className="tool-icon" />
          <div className="tool-label">Activities</div>
        </div>
        <div className="msn-tool">
          <img src="/chat-icons/games-icon.svg" alt="Games" className="tool-icon" />
          <div className="tool-label">Games</div>
        </div>
        <div className="msn-branding">
          <img src="/msn-logo.svg" alt="MSN" />
        </div>
      </div>
      
      <div className="game-container">
        <div className="msn-classic-chat">
          <div className="classic-chat-main">
            <div className="to-field">
              <div className="to-label">To:</div>
              <div className="to-value">{contact.name}</div>
            </div>
            
            <div className="chat-message-area">
              {/* This area will display the conversation */}
              {messages.map(message => (
                <div 
                  key={message.id} 
                  className={`message ${message.isOwn ? 'own-message' : 'other-message'}`}
                >
                  <div className="message-sender">{message.sender}:</div>
                  <div className="message-content">{message.content}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            
            <div className="chat-input-container">
              <div className="formatting-toolbar">
                <button className="formatting-btn font-btn">A</button>
                <button className="formatting-btn emoji-btn">😊</button>
                <button className="formatting-btn voice-clip-btn">🔊</button>
                <button className="formatting-btn emoji-selector">😊</button>
                <div className="extra-buttons">
                  <button className="formatting-btn">🎮</button>
                  <button className="formatting-btn">🎲</button>
                  <button className="formatting-btn">🎨</button>
                </div>
              </div>
              
              <div className="input-area">
                <textarea 
                  className="message-input"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                />
                <div className="input-buttons">
                  <button 
                    className="msn-win95-button"
                    onClick={handleSendMessage}
                    disabled={inputMessage.trim() === ''}
                  >
                    Send
                  </button>
                  <button className="msn-win95-button">
                    Search
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="classic-chat-sidebar">
            <div className="display-pic-container user-dp">
              <img 
                src="/online-alien.svg" 
                alt="Your Display Picture"
                className="display-pic" 
              />
            </div>
            
            <div className="display-pic-container contact-dp">
              <img 
                src={contact.status === 'offline' ? "/offline-alien.svg" : "/online-alien.svg"}
                alt={`${contact.name}'s Display Picture`}
                className="display-pic" 
              />
            </div>
          </div>
        </div>
      
        <div className="msn-footer">
          Click for new Emoticons and Theme Packs from Blue Mountain
        </div>
      </div>
    </div>
  );
};

const MsnChat: React.FC<MsnChatProps> = ({ onClose }) => {
  const [position, setPosition] = useState({ x: 200, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [chatWindows, setChatWindows] = useState<ChatWindow[]>([]);
  const [userStatus, setUserStatus] = useState<'online' | 'away' | 'busy' | 'offline'>('online');
  const [statusMessage, setStatusMessage] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([
    { id: '1', name: 'Buzz Aldrin', status: 'busy', avatar: '👨‍🚀' },
    { id: '2', name: 'Mars Rover', status: 'online', avatar: '🤖' },
    { id: '3', name: 'Xenon', status: 'online', avatar: '👽' },
    { id: '4', name: 'Phobos', status: 'online', avatar: '🪐' },
    { id: '5', name: 'DeimosX', status: 'away', avatar: '☄️' },
    { id: '6', name: 'red_planet42@mars.com', status: 'offline', avatar: '👽' },
    { id: '7', name: 'spacecadet', status: 'offline', avatar: '👽' },
    { id: '8', name: 'area51_visitor', status: 'offline', avatar: '👽' },
    { id: '9', name: 'Martian_Manhunter', status: 'offline', avatar: '👽' },
    { id: '10', name: 'AstroBotany', status: 'offline', avatar: '👽' },
    { id: '11', name: 'DustStorm', status: 'offline', avatar: '👽' },
  ]);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const [minimizedChats, setMinimizedChats] = useState<string[]>([]);

  // Add window-level event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('.win95-title-bar')) {
      setIsDragging(true);
      const rect = e.currentTarget.getBoundingClientRect();
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Keep window within viewport
      const maxX = window.innerWidth - 280; // Window width
      const maxY = window.innerHeight - 500; // Window height
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const openChatWindow = (contact: Contact) => {
    // Check if chat window already exists
    if (!chatWindows.find(chat => chat.contact.id === contact.id)) {
      // Position the new window in a cascading manner
      const offsetX = 320 + ((chatWindows.length % 5) * 30);
      const offsetY = 100 + ((chatWindows.length % 5) * 30);
      
      const newChatWindow: ChatWindow = {
        contact,
        position: { x: offsetX, y: offsetY },
        messages: [
          {
            id: Date.now().toString(),
            sender: 'System',
            content: `Chat started with ${contact.name}`,
            timestamp: new Date(),
            isOwn: false
          }
        ],
        isMinimized: false
      };
      
      setChatWindows(prev => [...prev, newChatWindow]);
    } else {
      // If chat window exists but is minimized, restore it
      if (minimizedChats.includes(contact.id)) {
        setMinimizedChats(prev => prev.filter(id => id !== contact.id));
        
        // Update chat window minimized state
        setChatWindows(prev => 
          prev.map(chat => 
            chat.contact.id === contact.id 
              ? { ...chat, isMinimized: false } 
              : chat
          )
        );
      }
    }
  };

  const closeChatWindow = (contactId: string) => {
    setChatWindows(prev => prev.filter(chat => chat.contact.id !== contactId));
    // Also remove from minimized chats if it was there
    setMinimizedChats(prev => prev.filter(id => id !== contactId));
  };

  const minimizeChatWindow = (contactId: string) => {
    // Add to minimized chats list
    if (!minimizedChats.includes(contactId)) {
      setMinimizedChats(prev => [...prev, contactId]);
    }
    
    // Update chat window minimized state
    setChatWindows(prev => 
      prev.map(chat => 
        chat.contact.id === contactId 
          ? { ...chat, isMinimized: true } 
          : chat
      )
    );
  };

  const updateChatPosition = (contactId: string, newPosition: { x: number, y: number }) => {
    setChatWindows(prev => 
      prev.map(chat => 
        chat.contact.id === contactId 
          ? { ...chat, position: newPosition } 
          : chat
      )
    );
  };

  const sendMessage = (contactId: string, content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      sender: 'You',
      content,
      timestamp: new Date(),
      isOwn: true
    };
    
    // Add message to the specific chat window
    setChatWindows(prev => 
      prev.map(chat => {
        if (chat.contact.id === contactId) {
          return { ...chat, messages: [...chat.messages, newMessage] };
        }
        return chat;
      })
    );
    
    // Simulate a response after a short delay
    setTimeout(() => {
      const responseMessages = [
        'Hey there!',
        'How are you doing today?',
        'What\'s up?',
        'I\'m busy right now, talk later?',
        'LOL 😂',
        '<(")_',
        'brb',
        'a/s/l?',
        '👋 Hi!'
      ];
      
      const contact = contacts.find(c => c.id === contactId)!;
      const responseMessage: Message = {
        id: Date.now().toString(),
        sender: contact.name,
        content: responseMessages[Math.floor(Math.random() * responseMessages.length)],
        timestamp: new Date(),
        isOwn: false
      };
      
      setChatWindows(prev => 
        prev.map(chat => {
          if (chat.contact.id === contactId) {
            return { ...chat, messages: [...chat.messages, responseMessage] };
          }
          return chat;
        })
      );
    }, 1000 + Math.random() * 2000);
  };

  const getStatusIcon = (status: Contact['status']) => {
    switch (status) {
      case 'online': return <span className="status-circle online-status"></span>;
      case 'away': return <span className="status-circle away-status"></span>;
      case 'busy': return <span className="status-circle busy-status"></span>;
      case 'offline': return <span className="status-circle offline-status"></span>;
      default: return <span className="status-circle offline-status"></span>;
    }
  };

  const getOnlineContacts = () => {
    return contacts.filter(contact => contact.status !== 'offline');
  };

  const getOfflineContacts = () => {
    return contacts.filter(contact => contact.status === 'offline');
  };

  const restoreMinimizedChat = (contactId: string) => {
    setMinimizedChats(prev => prev.filter(id => id !== contactId));
    
    // Update chat window minimized state
    setChatWindows(prev => 
      prev.map(chat => 
        chat.contact.id === contactId 
          ? { ...chat, isMinimized: false } 
          : chat
      )
    );
  };

  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  return (
    <>
      <div 
        className="win95-window"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
        ref={chatWindowRef}
        onMouseDown={handleMouseDown}
      >
        <div className="win95-title-bar">
          <span>MSN Messenger</span>
          <div className="window-controls">
            <button className="minimize" title="Minimize">-</button>
            <button className="maximize" title="Maximize">□</button>
            <button className="close" onClick={onClose} title="Close">×</button>
          </div>
        </div>
        
        <div className="menu-bar">
          <div 
            className="menu-item"
            onClick={toggleMenu}
            style={{ position: 'relative' }}
          >
            File
            {showMenu && (
              <div className="menu-dropdown">
                <div className="menu-option">
                  Send Instant Message
                </div>
                <div className="menu-option" onClick={onClose}>
                  Close
                </div>
              </div>
            )}
          </div>
          <span className="menu-item">Edit</span>
          <span className="menu-item">View</span>
          <span className="menu-item">Tools</span>
          <span className="menu-item">Help</span>
        </div>
        
        <div className="game-container">
          <div className="msn-content">
            <div className="msn-main-view">
              <div className="msn-sidebar">
                <div className="sidebar-icon">
                  <img src="/online-alien.svg" alt="Online Alien" width="20" height="20" />
                </div>
                <div className="sidebar-icon">✉️</div>
                <div className="sidebar-icon">☎️</div>
                <div className="sidebar-icon">🌐</div>
                <div className="sidebar-icon">🎮</div>
                <div className="sidebar-icon">🎵</div>
                <div className="sidebar-icon">🔍</div>
                <div className="sidebar-icon">⚙️</div>
              </div>
              
              <div className="msn-contacts-view">
                <div className="msn-status-bar">
                  <div className="user-status">
                    <span className="user-icon">
                      <img src="/online-alien.svg" alt="Online Alien" width="16" height="16" />
                    </span>
                    <span className="status-text">My Status:</span>
                    <span className="user-name">xXx_M4r5_xXx (Online)</span>
                  </div>
                  <div className="email-status">
                    <span className="email-icon">✉️</span>
                    <span className="email-text">No new transmissions from Earth</span>
                  </div>
                </div>
                
                <div className="contacts-groups">
                  <div className="contact-group">
                    <div className="group-header">
                      <span className="group-toggle">▼</span>
                      <span className="group-name">Online ({getOnlineContacts().length})</span>
                    </div>
                    <div className="group-contacts">
                      {getOnlineContacts().map(contact => (
                        <div 
                          key={contact.id} 
                          className="contact-item"
                          onClick={() => openChatWindow(contact)}
                        >
                          <div className="contact-avatar">
                            <img src="/online-alien.svg" alt="Online Alien" width="16" height="16" />
                          </div>
                          <div className="contact-name-status">
                            <span className="contact-name">{contact.name}</span>
                            {contact.status !== 'online' && (
                              <span className="contact-status-text">({contact.status})</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="contact-group">
                    <div className="group-header">
                      <span className="group-toggle">▼</span>
                      <span className="group-name">Not Online ({getOfflineContacts().length})</span>
                    </div>
                    <div className="group-contacts">
                      {getOfflineContacts().map(contact => (
                        <div 
                          key={contact.id} 
                          className="contact-item"
                          onClick={() => openChatWindow(contact)}
                        >
                          <div className="contact-avatar">
                            <img src="/offline-alien.svg" alt="Offline Alien" width="16" height="16" />
                          </div>
                          <span className="contact-name">{contact.email || contact.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="quick-actions">
                  <div className="action-label">I want to...</div>
                  <div className="action-item">
                    <span className="action-icon">➕</span>
                    <span className="action-text">Add an Alien Contact</span>
                  </div>
                  <div className="action-item">
                    <span className="action-icon">✉️</span>
                    <span className="action-text">Send an Interplanetary Message</span>
                  </div>
                  <div className="action-item">
                    <span className="action-icon">📎</span>
                    <span className="action-text">Send a Martian Landscape Photo</span>
                  </div>
                  <div className="action-item">
                    <span className="action-icon">🎮</span>
                    <span className="action-text">Play Zero-G Games</span>
                  </div>
                  <div className="action-item">
                    <span className="action-icon">🔍</span>
                    <span className="action-text">Search for Extraterrestrial Life</span>
                  </div>
                </div>
                
                <div className="msn-ad-banner">
                  <div className="msn-ad-content">
                    <div className="msn-logo-small">msn</div>
                    <div className="ad-text">New Radiation Protection service</div>
                    <button className="msn-ad-button">Join Mars Colony® now!</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Taskbar showing minimized chats */}
          {minimizedChats.length > 0 && (
            <div className="msn-taskbar">
              {minimizedChats.map(chatId => {
                const chat = chatWindows.find(w => w.contact.id === chatId);
                if (!chat) return null;
                return (
                  <div 
                    key={chatId} 
                    className="msn-taskbar-item"
                    onClick={() => restoreMinimizedChat(chatId)}
                  >
                    <img src="/msn-logo.svg" alt="MSN" className="msn-logo-small" />
                    <span className="taskbar-item-name">{chat.contact.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* Render all chat windows */}
      {chatWindows.map(chatWindow => (
        <ChatWindow 
          key={chatWindow.contact.id}
          chatWindow={chatWindow}
          onClose={closeChatWindow}
          onMessageSend={sendMessage}
          onPositionChange={updateChatPosition}
          onMinimize={minimizeChatWindow}
        />
      ))}
    </>
  );
};

export default MsnChat;