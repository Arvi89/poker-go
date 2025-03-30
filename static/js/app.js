// Global state
const state = {
    currentView: 'landing',
    currentRoom: null,
    isCreator: false,
    playerName: '',
    playerID: null,
    selectedCard: null,
    roomStatus: 'voting',
    websocket: null,
    sessionStorage: {
        setItem(key, value) {
            try {
                sessionStorage.setItem(key, value);
            } catch (e) {
                console.warn('SessionStorage not available:', e);
            }
        },
        getItem(key) {
            try {
                return sessionStorage.getItem(key);
            } catch (e) {
                console.warn('SessionStorage not available:', e);
                return null;
            }
        },
        removeItem(key) {
            try {
                sessionStorage.removeItem(key);
            } catch (e) {
                console.warn('SessionStorage not available:', e);
            }
        }
    }
};

// Track current room state
let currentRoomState = null;

// DOM Elements
const homeScreen = document.getElementById('home-screen');
const roomScreen = document.getElementById('room-screen');
const createRoomForm = document.getElementById('create-room-form');
const joinRoomForm = document.getElementById('join-room-form');
const creatorNameInput = document.getElementById('creator-name');
const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id');
const roomIdDisplay = document.getElementById('room-id-display');
const shareRoomBtn = document.getElementById('share-room');
const leaveRoomBtn = document.getElementById('leave-room');
const revealCardsBtn = document.getElementById('reveal-cards');
const statusText = document.getElementById('status-text');
const creatorControls = document.getElementById('creator-controls');
const playersContainer = document.getElementById('players-container');
const cardButtons = document.querySelectorAll('.card-btn');
const notification = document.getElementById('notification');
const historyPanel = document.getElementById('history-panel');
const toggleHistoryBtn = document.getElementById('toggle-history');
const closeHistoryBtn = document.getElementById('close-history');
const voteHistoryElement = document.getElementById('vote-history');
const updateLinkBtn = document.getElementById('update-link');
const sessionLinkInput = document.getElementById('session-link');
const sessionLinkDisplay = document.getElementById('session-link-display');
const sessionLinkAnchor = document.getElementById('session-link-anchor');

// Event Listeners
createRoomForm.addEventListener('submit', createRoom);
joinRoomForm.addEventListener('submit', joinRoom);
shareRoomBtn.addEventListener('click', () => {
    if (!state.currentRoom) return;
    
    // Create a full absolute URL including protocol and domain
    const roomUrl = new URL(`/room/${state.currentRoom}`, window.location.origin).href;
    
    // Check if the browser supports navigator.share API
    if (navigator.share) {
        navigator.share({
            title: 'Join my Planning Poker room',
            text: `Join my Planning Poker session with room ID: ${state.currentRoom}`,
            url: roomUrl
        }).catch(error => {
            console.log('Error sharing:', error);
            fallbackCopyToClipboard(roomUrl);
        });
    } else {
        fallbackCopyToClipboard(roomUrl);
    }
});
leaveRoomBtn.addEventListener('click', leaveRoom);
revealCardsBtn.addEventListener('click', toggleVoting);
toggleHistoryBtn.addEventListener('click', toggleHistoryPanel);
closeHistoryBtn.addEventListener('click', closeHistoryPanel);
cardButtons.forEach(button => {
    button.addEventListener('click', () => {
        selectCard(button.dataset.value);
    });
});
updateLinkBtn.addEventListener('click', updateSessionLink);

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check URL parameters for room ID
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
        roomIdInput.value = roomId;
        playerNameInput.focus();
    }
    
    // Check for room in URL path
    checkForRoomInURL();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (state.currentRoom && state.playerID) {
        // Try to leave the room gracefully
        fetch(`/api/rooms/${state.currentRoom}/leave?playerID=${encodeURIComponent(state.playerID)}`, {
            method: 'GET',
            keepalive: true
        });
    }
});

// API Functions
async function createRoom(e) {
    e.preventDefault();
    const name = creatorNameInput.value.trim();
    
    if (!name) {
        showNotification('Please enter your name', true);
        return;
    }
    
    try {
        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
            throw new Error(responseData.error || 'Failed to create room');
        }
        
        // With new API format, data is nested inside a "data" field
        const data = responseData.data || responseData;
        
        // Set state
        state.currentRoom = data.roomId;
        state.playerName = name;
        
        // Get player ID from response
        if (data.playerID) {
            state.playerID = data.playerID;
        } else {
            console.error("Server did not return a player ID for the creator");
            throw new Error("No player ID received from server");
        }
        
        state.isCreator = true;
        
        // Enter the room
        enterRoom();
        
        // Extra check to ensure room is properly initialized
        setTimeout(() => {
            if (playersContainer.innerHTML.trim() === '') {
                // If the players container is empty after a delay, try to fetch the room state
                console.log("Room appears empty, fetching state again...");
                fetchRoomState();
            }
        }, 1000);
        
    } catch (error) {
        showNotification(error.message, true);
    }
}

async function joinRoom(e) {
    e.preventDefault();
    const name = playerNameInput.value.trim();
    const roomId = roomIdInput.value.trim();
    
    if (!name || !roomId) {
        showNotification('Please enter your name and room ID', true);
        return;
    }
    
    try {
        const response = await fetch(`/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
            throw new Error(responseData.error || 'Failed to join room');
        }
        
        // With new API format, data is nested inside a "data" field
        const data = responseData.data || responseData;
        
        // Set state
        state.currentRoom = roomId;
        state.playerName = name;
        state.playerID = data.playerID; // Store the player ID from the server
        state.isCreator = false;
        
        // Enter the room
        enterRoom();
        
    } catch (error) {
        showNotification(error.message, true);
    }
}

async function leaveRoom() {
    if (!state.currentRoom || !state.playerID) return;
    
    try {
        const response = await fetch(`/api/rooms/${state.currentRoom}/leave?playerID=${encodeURIComponent(state.playerID)}`);
        
        // Even if the request fails, reset the app state
        resetState();
        
        // Go back to home screen
        homeScreen.classList.remove('hidden');
        roomScreen.classList.add('hidden');
        
        // Update URL
        history.pushState({}, '', '/');
        
    } catch (error) {
        console.error('Error leaving room:', error);
        // Still reset state and go to home screen even if the request fails
        resetState();
        homeScreen.classList.remove('hidden');
        roomScreen.classList.add('hidden');
    }
}

async function selectCard(cardValue) {
    if (!state.currentRoom || !state.playerID) return;
    
    // Prevent voting if cards are revealed
    if (state.roomStatus !== 'voting') {
        showNotification('Voting is closed. Wait for reset to vote again.', true);
        return;
    }
    
    try {
        const response = await fetch(`/api/rooms/${state.currentRoom}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                playerID: state.playerID,
                card: cardValue
            })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to submit vote');
        }
        
        // Update UI
        state.selectedCard = cardValue;
        updateCardSelection();
        
    } catch (error) {
        showNotification(error.message, true);
    }
}

async function toggleVoting() {
    if (!state.currentRoom || !state.playerID || !state.isCreator) return;
    
    try {
        if (state.roomStatus === 'voting') {
            // Reveal cards
            const response = await fetch(`/api/rooms/${state.currentRoom}/reveal?playerID=${encodeURIComponent(state.playerID)}`);
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reveal cards');
            }
            
            // Update button text
            revealCardsBtn.textContent = 'Restart Voting';
            
        } else {
            // Reset voting
            const response = await fetch(`/api/rooms/${state.currentRoom}/reset?playerID=${encodeURIComponent(state.playerID)}`);
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reset voting');
            }
            
            // Reset selected card for current user
            state.selectedCard = null;
            updateCardSelection();
            
            // Manual fetch room state to ensure everything is updated
            await fetchRoomState();
            
            // Update button text
            revealCardsBtn.textContent = 'Reveal Cards';
            
            // Clear the link field and update the room's link to empty
            if (state.isCreator) {
                // Clear the input field
                sessionLinkInput.value = '';
                
                // Explicitly clear the link in the database
                try {
                    await fetch(`/api/rooms/${state.currentRoom}?playerID=${encodeURIComponent(state.playerID)}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ link: '' })
                    });
                    
                    // Also clear the link display for all participants
                    updateLinkDisplay('');
                } catch (linkError) {
                    console.error('Failed to clear link:', linkError);
                }
            }
        }
    } catch (error) {
        showNotification(error.message, true);
    }
}

async function updateSessionLink() {
    if (!state.currentRoom || !state.playerID || !state.isCreator) return;
    
    const link = sessionLinkInput.value.trim();
    
    try {
        const response = await fetch(`/api/rooms/${state.currentRoom}?playerID=${encodeURIComponent(state.playerID)}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ link })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update link');
        }
        
        // Link will be updated for all users via WebSocket
        showNotification('Link updated successfully');
        
    } catch (error) {
        showNotification(error.message, true);
    }
}

// UI Functions
function enterRoom() {
    // Update URL
    history.pushState({}, '', `/room/${state.currentRoom}`);
    
    // Save player data to local storage for this room
    state.sessionStorage.setItem(`poker_player_${state.currentRoom}`, state.playerName);
    if (state.playerID) {
        state.sessionStorage.setItem(`poker_playerID_${state.currentRoom}`, state.playerID);
        if (state.isCreator) {
            state.sessionStorage.setItem(`poker_isCreator_${state.currentRoom}`, 'true');
        } else {
            state.sessionStorage.removeItem(`poker_isCreator_${state.currentRoom}`);
        }
    } else {
        console.error("Entering room without a player ID");
    }
    
    // Update room display
    roomIdDisplay.textContent = state.currentRoom;
    
    // Show creator controls only if we're the creator
    if (state.isCreator) {
        creatorControls.classList.remove('hidden');
    } else {
        creatorControls.classList.add('hidden');
    }
    
    // Hide home screen, show room screen
    homeScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');
    
    // Connect to websocket only if we have a player ID
    if (state.playerID) {
        connectWebSocket();
    } else {
        console.error("Cannot connect to WebSocket: no player ID available");
    }
}

function connectWebSocket() {
    // Close any existing connection
    if (state.websocket) {
        state.websocket.close();
        state.websocket = null;
    }
    
    // Create connection URL with appropriate protocol
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const url = `${protocol}${window.location.host}/api/rooms/${state.currentRoom}/ws?playerID=${encodeURIComponent(state.playerID)}`;
    
    try {
        // Create new WebSocket connection
        state.websocket = new WebSocket(url);
        
        // Set up event handlers
        state.websocket.onopen = () => console.log('WebSocket connection established');
        state.websocket.onmessage = handleRoomEvent;
        state.websocket.onerror = handleWebSocketError;
        state.websocket.onclose = handleWebSocketClose;
    } catch (error) {
        console.error('WebSocket connection error:', error);
        scheduleReconnect();
    }
}

function handleWebSocketError(error) {
    console.error('WebSocket error:', error);
}

function handleWebSocketClose() {
    console.log('WebSocket connection closed');
    scheduleReconnect();
}

function scheduleReconnect() {
    // Attempt to reconnect after a delay
    setTimeout(() => {
        if (state.currentRoom && state.playerID) {
            connectWebSocket();
        }
    }, 5000); // 5 second delay before reconnecting
}

function handleRoomEvent(event) {
    try {
        const data = JSON.parse(event.data);
        console.log('Received event:', data.type);
        
        // Call the appropriate event handler based on event type
        const handlers = {
            'initial_state': handleInitialState,
            'player_joined': handlePlayerJoined,
            'player_left': handlePlayerLeft,
            'vote_submitted': handleVoteSubmitted,
            'cards_revealed': handleCardsRevealed,
            'voting_reset': handleVotingReset,
            'link_updated': handleLinkUpdated,
            'creator_changed': handleCreatorChanged,
            'creator_transferred': handleCreatorTransferred
        };
        
        const handler = handlers[data.type];
        if (handler) {
            handler(data.payload);
        } else {
            console.log('Unknown event type:', data.type);
            fetchRoomState();
        }
    } catch (error) {
        console.error('Error handling event:', error);
    }
}

// Individual event handlers
function handleInitialState(payload) {
    updateRoomState(payload);
}

function handlePlayerJoined(payload) {
    showNotification(`${payload.name} joined the room`);
    fetchRoomState();
}

function handlePlayerLeft(payload) {
    showNotification(`${payload.name} left the room`);
    fetchRoomState();
}

function handleVoteSubmitted(payload) {
    showNotification(`${payload.name} submitted a vote`);
    fetchRoomState();
}

function handleCardsRevealed(payload) {
    showNotification('Cards revealed!');
    updateRoomState(payload);
}

function handleVotingReset(payload) {
    showNotification('Voting has been reset');
    
    // Reset the selected card in our local state
    state.selectedCard = null;
    updateCardSelection();
    
    // Make sure to fully update the room state
    updateRoomState(payload);
}

function handleLinkUpdated(payload) {
    if (payload.link) {
        showNotification('Session link updated');
    } else {
        showNotification('Session link removed');
    }
    updateLinkDisplay(payload.link);
}

function handleCreatorChanged(payload) {
    showNotification(`${payload.newCreator} is now the room creator`);
    fetchRoomState();
}

function handleCreatorTransferred(payload) {
    const message = `Creator role transferred from ${payload.previousCreator} to ${payload.newCreator}`;
    showNotification(message);
    
    // Close any open context menus
    document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
    
    // Immediately fetch the room state to get the updated creator information
    fetch(`/api/rooms/${state.currentRoom}?playerID=${encodeURIComponent(state.playerID)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch room state');
            }
            return response.json();
        })
        .then(room => {
            // Get current player from the updated room state
            const player = room.players[state.playerID];
            if (player) {
                // Update isCreator state based on the server's response
                state.isCreator = player.isCreator;
                
                // Update UI and storage based on creator status
                if (state.isCreator) {
                    creatorControls.classList.remove('hidden');
                    state.sessionStorage.setItem(`poker_isCreator_${state.currentRoom}`, 'true');
                } else {
                    creatorControls.classList.add('hidden');
                    state.sessionStorage.removeItem(`poker_isCreator_${state.currentRoom}`);
                }
                
                // Update the full room state
                updateRoomState(room);
            }
        })
        .catch(error => {
            console.error('Error updating after creator transfer:', error);
        });
}

function updateRoomState(room) {
    // Save current room state for reference
    currentRoomState = room;
    
    // Update status text and save room status in state
    state.roomStatus = room.status;
    statusText.textContent = room.status === 'voting' ? 'Voting in progress...' : 'Cards revealed';
    
    // Update reveal button text based on status
    revealCardsBtn.textContent = room.status === 'voting' ? 'Reveal Cards' : 'Restart Voting';
    
    // Enable/disable card selection based on room status
    const cardSelectionSection = document.getElementById('card-selection');
    if (room.status === 'revealed') {
        cardSelectionSection.classList.add('disabled');
    } else {
        cardSelectionSection.classList.remove('disabled');
        
        // If we're in voting status, ensure our selection matches what the server knows
        if (state.playerID && room.players[state.playerID]) {
            const serverCard = room.players[state.playerID].card;
            // If the server shows we haven't voted or have unknown card, reset our selection
            if (serverCard === 'unknown') {
                state.selectedCard = null;
                updateCardSelection();
            } else if (serverCard !== state.selectedCard) {
                // Otherwise, sync with server's value
                state.selectedCard = serverCard;
                updateCardSelection();
            }
        }
    }
    
    // Update the session link display for all participants
    updateLinkDisplay(room.link);
    
    // Update link input if we're the creator
    if (state.isCreator && room.link) {
        sessionLinkInput.value = room.link;
    }
    
    // Check if our creator status matches what's on the server
    if (state.playerID) {
        const player = room.players[state.playerID];
        if (player) {
            // Update our creator status if it's different from the server
            if (player.isCreator !== state.isCreator) {
                state.isCreator = player.isCreator;
                
                // Update local storage
                if (state.isCreator) {
                    state.sessionStorage.setItem(`poker_isCreator_${state.currentRoom}`, 'true');
                } else {
                    state.sessionStorage.removeItem(`poker_isCreator_${state.currentRoom}`);
                }
                
                // Update UI
                if (state.isCreator) {
                    creatorControls.classList.remove('hidden');
                } else {
                    creatorControls.classList.add('hidden');
                }
            }
        }
    }
    
    // Always render players
    renderPlayers(room);
    
    // Add statistics below if cards are revealed
    if (room.status === 'revealed') {
        renderStatistics(room);
    }
    
    // Always render voting history
    renderVoteHistory(room);
    
    // Update history button status - show only if there's history
    if (room.voteHistory && room.voteHistory.length > 0) {
        toggleHistoryBtn.classList.remove('hidden');
    } else {
        toggleHistoryBtn.classList.add('hidden');
    }
}

function renderPlayers(room) {
    // Clear the player container first
    playersContainer.innerHTML = '';
    
    // Create a section specifically for player cards
    const playerCardsSection = document.createElement('div');
    playerCardsSection.className = 'player-cards-section';
    
    // Sort players by joined time
    const sortedPlayers = Object.values(room.players).sort((a, b) => 
        new Date(a.joinedAt) - new Date(b.joinedAt)
    );
    
    sortedPlayers.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        
        if (player.isCreator) {
            playerCard.classList.add('is-creator');
        }
        
        // Add clickable class to cards that can have creator role transferred to them
        if (state.isCreator && player.id !== state.playerID) {
            playerCard.classList.add('clickable');
        }
        
        const playerName = document.createElement('div');
        playerName.className = 'player-name';
        playerName.textContent = player.id === state.playerID ? `${player.name} (You)` : player.name;
        
        const pokerCard = document.createElement('div');
        pokerCard.className = 'poker-card';
        
        // When cards are revealed, everyone can see all values
        if (room.status === 'revealed') {
            if (player.card === 'unknown') {
                pokerCard.classList.add('hidden-card');
                pokerCard.textContent = '?';
            } else {
                pokerCard.textContent = player.card === 'coffee' ? '☕' : player.card;
            }
        } else if (player.id === state.playerID) {
            // Current player can see their own card
            pokerCard.textContent = player.card === 'coffee' ? '☕' : player.card;
            if (player.card === 'unknown') {
                pokerCard.classList.add('hidden-card');
                pokerCard.textContent = '?';
            }
        } else {
            // Other players' cards - show voted state but not value
            if (player.card === 'unknown') {
                // Player hasn't voted
                pokerCard.classList.add('hidden-card');
                pokerCard.textContent = '?';
            } else {
                // Player has voted but cards aren't revealed
                pokerCard.classList.add('voted-card');
                pokerCard.textContent = '✓';
            }
        }
        
        // Add context menu for transfer creator role functionality
        if (state.isCreator && player.id !== state.playerID) {
            playerCard.addEventListener('click', (e) => {
                // Remove any existing active menus
                document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
                
                // Create context menu
                const menu = document.createElement('div');
                menu.className = 'context-menu';
                
                const transferOption = document.createElement('div');
                transferOption.className = 'menu-option';
                transferOption.textContent = 'Transfer creator role';
                transferOption.addEventListener('click', (e) => {
                    e.stopPropagation();
                    transferCreatorRole(player.id);
                    menu.remove();
                });
                
                menu.appendChild(transferOption);
                
                // Position menu near the player card
                menu.style.top = `${e.clientY}px`;
                menu.style.left = `${e.clientX}px`;
                
                document.body.appendChild(menu);
                
                // Close menu when clicking outside
                setTimeout(() => {
                    window.addEventListener('click', function closeMenu() {
                        menu.remove();
                        window.removeEventListener('click', closeMenu);
                    }, { once: true });
                }, 0);
            });
        }
        
        playerCard.appendChild(playerName);
        playerCard.appendChild(pokerCard);
        playerCardsSection.appendChild(playerCard);
    });
    
    // Add the player cards section to the container
    playersContainer.appendChild(playerCardsSection);
}

function renderStatistics(room) {
    // Create statistics container
    const statsContainer = document.createElement('div');
    statsContainer.className = 'statistics-container';
    
    // Add average section
    const averageSection = document.createElement('div');
    averageSection.className = 'statistics-section';
    
    const averageTitle = document.createElement('h3');
    averageTitle.textContent = 'Average';
    
    // Calculate vote statistics
    const votes = {};
    let totalNumericVotes = 0;
    let numericVoteCount = 0;
    
    // Initialize vote counts
    Object.values(room.players).forEach(player => {
        const card = player.card;
        if (card !== 'unknown') {
            votes[card] = (votes[card] || 0) + 1;
            
            // Calculate average for numeric cards
            const numericValue = parseFloat(card);
            if (!isNaN(numericValue)) {
                totalNumericVotes += numericValue;
                numericVoteCount++;
            }
        }
    });
    
    // Calculate average of numeric votes
    const average = numericVoteCount > 0 ? (totalNumericVotes / numericVoteCount).toFixed(1) : 'N/A';
    
    const averageValue = document.createElement('div');
    averageValue.className = 'statistics-value';
    averageValue.textContent = average;
    
    averageSection.appendChild(averageTitle);
    averageSection.appendChild(averageValue);
    statsContainer.appendChild(averageSection);
    
    // Add vote distribution section
    const distributionSection = document.createElement('div');
    distributionSection.className = 'statistics-section vote-distribution';
    
    const distributionTitle = document.createElement('h3');
    distributionTitle.textContent = 'Vote Distribution';
    distributionSection.appendChild(distributionTitle);
    
    // Sort cards by value for display
    const sortOrder = {
        '0': 0, '1': 1, '2': 2, '3': 3, '5': 4, '8': 5, '13': 6, 
        '20': 7, '40': 8, '100': 9, '?': 10, 'coffee': 11
    };
    
    const sortedCards = Object.keys(votes).sort((a, b) => {
        return (sortOrder[a] || 999) - (sortOrder[b] || 999);
    });
    
    // Create vote bars
    const maxVotes = Math.max(...Object.values(votes));
    
    sortedCards.forEach(card => {
        const voteCount = votes[card];
        const percentage = (voteCount / maxVotes) * 100;
        
        const voteBar = document.createElement('div');
        voteBar.className = 'vote-bar';
        
        const voteLabel = document.createElement('div');
        voteLabel.className = 'vote-label';
        voteLabel.textContent = card === 'coffee' ? '☕' : card;
        
        const voteProgress = document.createElement('div');
        voteProgress.className = 'vote-progress';
        
        const voteProgressBar = document.createElement('div');
        voteProgressBar.className = 'vote-progress-bar';
        voteProgressBar.style.width = `${percentage}%`;
        
        const voteCountDisplay = document.createElement('div');
        voteCountDisplay.className = 'vote-count';
        voteCountDisplay.textContent = voteCount;
        
        voteProgress.appendChild(voteProgressBar);
        
        voteBar.appendChild(voteLabel);
        voteBar.appendChild(voteProgress);
        voteBar.appendChild(voteCountDisplay);
        
        distributionSection.appendChild(voteBar);
    });
    
    statsContainer.appendChild(distributionSection);
    
    // Add the statistics container to the table
    playersContainer.appendChild(statsContainer);
}

function renderVoteHistory(room) {
    // Clear the history element
    voteHistoryElement.innerHTML = '';
    
    // If there's no history, keep the panel closed and return
    if (!room.voteHistory || room.voteHistory.length === 0) {
        return;
    }
    
    // Get the history sorted by timestamp (newest first)
    const sortedHistory = [...room.voteHistory].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // Render each history item
    sortedHistory.forEach((session, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        // Create header with timestamp
        const header = document.createElement('div');
        header.className = 'history-header';
        
        const title = document.createElement('div');
        title.className = 'history-title';
        title.textContent = `Session ${sortedHistory.length - index}`;
        
        const timestamp = document.createElement('div');
        timestamp.className = 'history-timestamp';
        const date = new Date(session.timestamp);
        timestamp.textContent = date.toLocaleString();
        
        header.appendChild(title);
        header.appendChild(timestamp);
        historyItem.appendChild(header);
        
        // Create player votes section
        const playerVotes = document.createElement('div');
        playerVotes.className = 'history-player-votes';
        
        // Add each player's vote
        Object.values(session.players).forEach(player => {
            const playerVote = document.createElement('div');
            playerVote.className = 'history-player-vote';
            
            const playerName = document.createElement('div');
            playerName.className = 'history-player-name';
            playerName.textContent = player.name;
            
            const playerCard = document.createElement('div');
            playerCard.className = 'history-player-card';
            if (player.card === 'unknown') {
                playerCard.classList.add('no-vote');
                playerCard.textContent = 'No vote';
            } else {
                playerCard.textContent = player.card === 'coffee' ? '☕' : player.card;
            }
            
            playerVote.appendChild(playerName);
            playerVote.appendChild(playerCard);
            playerVotes.appendChild(playerVote);
        });
        
        historyItem.appendChild(playerVotes);
        
        // Add session link if it exists
        if (session.link && session.link.trim() !== '') {
            const linkSection = document.createElement('div');
            linkSection.className = 'history-link';
            
            const linkAnchor = document.createElement('a');
            linkAnchor.href = session.link.startsWith('http') ? session.link : `https://${session.link}`;
            linkAnchor.target = '_blank';
            linkAnchor.rel = 'noopener noreferrer';
            linkAnchor.textContent = session.link;
            
            linkSection.appendChild(linkAnchor);
            historyItem.appendChild(linkSection);
        }
        
        // Calculate statistics for this session
        const votes = {};
        let totalNumericVotes = 0;
        let numericVoteCount = 0;
        
        // Initialize vote counts
        Object.values(session.players).forEach(player => {
            const card = player.card;
            if (card !== 'unknown') {
                votes[card] = (votes[card] || 0) + 1;
                
                // Calculate average for numeric cards
                const numericValue = parseFloat(card);
                if (!isNaN(numericValue)) {
                    totalNumericVotes += numericValue;
                    numericVoteCount++;
                }
            }
        });
        
        // Calculate average
        const average = numericVoteCount > 0 ? (totalNumericVotes / numericVoteCount).toFixed(1) : 'N/A';
        
        // Calculate mode (most common vote)
        let mode = 'N/A';
        let maxVotes = 0;
        for (const [card, count] of Object.entries(votes)) {
            if (count > maxVotes) {
                maxVotes = count;
                mode = card;
            }
        }
        if (mode === 'coffee') mode = '☕';
        
        // Create statistics section
        const statsSection = document.createElement('div');
        statsSection.className = 'history-statistics';
        
        // Add average stat
        const averageStat = document.createElement('div');
        averageStat.className = 'history-stat';
        
        const averageLabel = document.createElement('div');
        averageLabel.className = 'history-stat-label';
        averageLabel.textContent = 'Average';
        
        const averageValue = document.createElement('div');
        averageValue.className = 'history-stat-value';
        averageValue.textContent = average;
        
        averageStat.appendChild(averageLabel);
        averageStat.appendChild(averageValue);
        statsSection.appendChild(averageStat);
        
        // Add mode stat
        const modeStat = document.createElement('div');
        modeStat.className = 'history-stat';
        
        const modeLabel = document.createElement('div');
        modeLabel.className = 'history-stat-label';
        modeLabel.textContent = 'Most Common';
        
        const modeValue = document.createElement('div');
        modeValue.className = 'history-stat-value';
        modeValue.textContent = mode;
        
        modeStat.appendChild(modeLabel);
        modeStat.appendChild(modeValue);
        statsSection.appendChild(modeStat);
        
        // Add participants count
        const participantsStat = document.createElement('div');
        participantsStat.className = 'history-stat';
        
        const participantsLabel = document.createElement('div');
        participantsLabel.className = 'history-stat-label';
        participantsLabel.textContent = 'Participants';
        
        const participantsValue = document.createElement('div');
        participantsValue.className = 'history-stat-value';
        participantsValue.textContent = Object.keys(session.players).length;
        
        participantsStat.appendChild(participantsLabel);
        participantsStat.appendChild(participantsValue);
        statsSection.appendChild(participantsStat);
        
        historyItem.appendChild(statsSection);
        voteHistoryElement.appendChild(historyItem);
    });
}

function updateCardSelection() {
    cardButtons.forEach(btn => {
        if (btn.dataset.value === state.selectedCard) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

function showNotification(message, isError = false) {
    notification.textContent = message;
    notification.className = isError ? 'visible error' : 'visible';
    
    setTimeout(() => {
        notification.classList.remove('visible');
        notification.classList.remove('error');
    }, 3000);
}

// Reset the application state
function resetState() {
    // Reset local variables
    state.currentRoom = null;
    state.isCreator = false;
    state.playerName = '';
    state.playerID = null;
    state.selectedCard = null;
    state.roomStatus = 'voting';
    
    // Close WebSocket connection if open
    if (state.websocket) {
        state.websocket.close();
        state.websocket = null;
    }
    
    // Reset UI elements
    playersContainer.innerHTML = '';
    voteHistoryElement.innerHTML = '';
    historyPanel.classList.add('hidden');
    
    // Reset selected cards
    cardButtons.forEach(card => card.classList.remove('selected'));
    
    // Hide creator controls
    creatorControls.classList.add('hidden');
    
    // Reset session link display
    sessionLinkDisplay.classList.add('hidden');
    sessionLinkAnchor.href = '#';
    sessionLinkAnchor.textContent = '';
    sessionLinkInput.value = '';
    
    // Reset room ID display
    roomIdDisplay.textContent = '';
    
    // Reset form inputs for next use
    creatorNameInput.value = '';
    playerNameInput.value = '';
    roomIdInput.value = '';
    
    // Hide notifications
    notification.classList.remove('visible');
    notification.classList.remove('error');
    
    // Clear room state reference
    currentRoomState = null;
}

// Handle room URL detection
function checkForRoomInURL() {
    // Check if URL path contains a room ID
    const path = window.location.pathname;
    const match = path.match(/^\/room\/([a-zA-Z0-9-]+)$/);
    
    if (match && match[1]) {
        const roomId = match[1];
        
        // Check if we have this room ID and name in local storage
        const savedPlayerName = state.sessionStorage.getItem(`poker_player_${roomId}`);
        const savedPlayerID = state.sessionStorage.getItem(`poker_playerID_${roomId}`);
        const isCreator = state.sessionStorage.getItem(`poker_isCreator_${roomId}`) === 'true';
        
        if (savedPlayerName && savedPlayerID) {
            // Auto-join with saved credentials
            state.currentRoom = roomId;
            state.playerName = savedPlayerName;
            state.playerID = savedPlayerID;
            state.isCreator = isCreator;
            
            // Get the room state
            fetch(`/api/rooms/${roomId}?playerID=${encodeURIComponent(savedPlayerID)}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to rejoin room');
                    }
                    return response.json();
                })
                .then(room => {
                    // Check if we're properly recognized as a member in the room
                    const player = room.players[savedPlayerID];
                    if (player) {
                        // Update creator status based on current room state
                        if (player.isCreator !== state.isCreator) {
                            state.isCreator = player.isCreator;
                            if (state.isCreator) {
                                state.sessionStorage.setItem(`poker_isCreator_${state.currentRoom}`, 'true');
                            } else {
                                state.sessionStorage.removeItem(`poker_isCreator_${state.currentRoom}`);
                            }
                        }
                        
                        // Enter the room
                        enterRoom();
                    } else {
                        // We're not recognized, need to rejoin with our saved name
                        rejoinRoom(roomId, savedPlayerName);
                    }
                })
                .catch(error => {
                    console.error('Error rejoining room:', error);
                    
                    // Try to rejoin with the saved name for this room
                    if (savedPlayerName) {
                        rejoinRoom(roomId, savedPlayerName);
                    } else {
                        // Show join prompt
                        showRoomJoinPrompt(roomId);
                    }
                });
        } else {
            // Show name prompt modal
            showRoomJoinPrompt(roomId);
        }
    }
}

// Show a modal to prompt for name when joining via URL
function showRoomJoinPrompt(roomId) {
    // Pre-fill the room ID in the join form
    roomIdInput.value = roomId;
    
    // Focus on the name input
    playerNameInput.focus();
    
    // Show a notification
    showNotification('Please enter your name to join the room', false);
}

// Function to attempt rejoining a room
async function rejoinRoom(roomId, playerName) {
    try {
        const response = await fetch(`/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: playerName })
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
            // If rejoining fails, prompt for a new name
            showRoomJoinPrompt(roomId);
            return;
        }
        
        // With new API format, data is nested inside a "data" field
        const data = responseData.data || responseData;
        
        // Save the player ID we got from the server
        if (data.playerID) {
            state.playerID = data.playerID;
            
            // Successfully rejoined, enter the room
            enterRoom();
        } else {
            console.error("Server did not return a player ID when rejoining");
            showNotification('Failed to rejoin: no player ID received', true);
            showRoomJoinPrompt(roomId);
        }
        
    } catch (error) {
        showNotification(error.message, true);
        showRoomJoinPrompt(roomId);
    }
}

function toggleHistoryPanel() {
    historyPanel.classList.toggle('hidden');
    if (historyPanel.classList.contains('hidden')) {
        toggleHistoryBtn.textContent = 'Show History';
    } else {
        toggleHistoryBtn.textContent = 'Hide History';
    }
}

function closeHistoryPanel() {
    historyPanel.classList.add('hidden');
    toggleHistoryBtn.textContent = 'Show History';
}

// Function to update the link display for all participants
function updateLinkDisplay(link) {
    if (link && link.trim() !== '') {
        sessionLinkDisplay.classList.remove('hidden');
        sessionLinkAnchor.href = link.startsWith('http') ? link : `https://${link}`;
        sessionLinkAnchor.textContent = link;
    } else {
        sessionLinkDisplay.classList.add('hidden');
        sessionLinkAnchor.href = '#';
        sessionLinkAnchor.textContent = '';
    }
}

function fallbackCopyToClipboard(text) {
    // Create a temporary input element
    const input = document.createElement('input');
    input.style.position = 'fixed';
    input.style.opacity = 0;
    input.value = text;
    document.body.appendChild(input);
    
    // Select and copy
    input.select();
    document.execCommand('copy');
    
    // Clean up
    document.body.removeChild(input);
    
    // Show notification
    showNotification('Room URL copied to clipboard!');
}

// Fetch the current room state from the server
function fetchRoomState() {
    if (!state.currentRoom || !state.playerID) return;
    
    fetch(`/api/rooms/${state.currentRoom}?playerID=${encodeURIComponent(state.playerID)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch room state');
            }
            return response.json();
        })
        .then(room => {
            updateRoomState(room);
        })
        .catch(error => {
            console.error('Error fetching room state:', error);
        });
}

// Function to transfer the creator role to a new player
async function transferCreatorRole(newCreatorID) {
    if (!state.currentRoom || !state.playerID || !state.isCreator) return;
    
    try {
        // Immediately update local state to prevent UI confusion
        state.isCreator = false;
        creatorControls.classList.add('hidden');
        
        const response = await fetch(`/api/rooms/${state.currentRoom}/transfer-creator?playerID=${encodeURIComponent(state.playerID)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newCreatorID })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            // Revert state if transfer failed
            state.isCreator = true;
            creatorControls.classList.remove('hidden');
            throw new Error(data.error || 'Failed to transfer creator role');
        }
        
        // Update local storage if transfer was successful
        state.sessionStorage.removeItem(`poker_isCreator_${state.currentRoom}`);
        showNotification('Creator role transfer initiated');
    } catch (error) {
        showNotification(error.message, true);
    }
} 