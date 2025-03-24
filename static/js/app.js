// Global state
const state = {
    currentRoom: null,
    playerName: '',
    isCreator: false,
    eventSource: null,
    selectedCard: null,
    roomStatus: 'voting',
    // For session persistence
    sessionStorage: {
        setItem(key, value) {
            localStorage.setItem(key, value);
        },
        getItem(key) {
            return localStorage.getItem(key);
        },
        removeItem(key) {
            localStorage.removeItem(key);
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
shareRoomBtn.addEventListener('click', shareRoom);
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

// Check for room ID in URL on page load
document.addEventListener('DOMContentLoaded', checkForRoomInURL);

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
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to create room');
        }
        
        // Set state
        state.currentRoom = data.roomId;
        state.playerName = name;
        state.isCreator = true;
        
        // Enter the room
        enterRoom();
        
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
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to join room');
        }
        
        // Set state
        state.currentRoom = roomId;
        state.playerName = name;
        state.isCreator = false;
        
        // Enter the room
        enterRoom();
        
    } catch (error) {
        showNotification(error.message, true);
    }
}

async function leaveRoom() {
    if (!state.currentRoom || !state.playerName) return;
    
    try {
        // Close event source first
        if (state.eventSource) {
            state.eventSource.close();
        }
        
        await fetch(`/api/rooms/${state.currentRoom}/leave?name=${encodeURIComponent(state.playerName)}`);
        
        // Reset state
        resetState();
        
        // Reset URL
        history.pushState({}, '', '/');
        
        // Show home screen
        homeScreen.classList.remove('hidden');
        roomScreen.classList.add('hidden');
        
    } catch (error) {
        showNotification(error.message, true);
    }
}

async function selectCard(cardValue) {
    if (!state.currentRoom || !state.playerName) return;
    
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
                name: state.playerName,
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
    if (!state.currentRoom || !state.playerName || !state.isCreator) return;
    
    try {
        if (state.roomStatus === 'voting') {
            // Check if anyone has voted before revealing
            const anyVotes = Object.values(currentRoomState.players).some(player => player.card !== 'unknown');
            if (!anyVotes) {
                showNotification('Cannot reveal cards when no one has voted', true);
                return;
            }
            
            // Reveal cards
            const response = await fetch(`/api/rooms/${state.currentRoom}/reveal?name=${encodeURIComponent(state.playerName)}`);
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reveal cards');
            }
            
            // Update button text
            revealCardsBtn.textContent = 'Restart Voting';
        } else {
            // Reset voting
            const response = await fetch(`/api/rooms/${state.currentRoom}/reset?name=${encodeURIComponent(state.playerName)}`);
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reset voting');
            }
            
            // Reset selected card
            state.selectedCard = null;
            updateCardSelection();
            
            // Update button text
            revealCardsBtn.textContent = 'Reveal Cards';
            
            // Clear the link field and update the room's link to empty
            if (state.isCreator) {
                // Clear the input field
                sessionLinkInput.value = '';
                
                // Explicitly clear the link in the database
                try {
                    await fetch(`/api/rooms/${state.currentRoom}/link?name=${encodeURIComponent(state.playerName)}`, {
                        method: 'POST',
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
    if (!state.currentRoom || !state.playerName || !state.isCreator) return;
    
    const link = sessionLinkInput.value.trim();
    
    try {
        const response = await fetch(`/api/rooms/${state.currentRoom}/link?name=${encodeURIComponent(state.playerName)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ link })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update link');
        }
        
        showNotification('Link updated successfully');
        
    } catch (error) {
        showNotification(error.message, true);
    }
}

// UI Functions
function enterRoom() {
    // Update URL
    history.pushState({}, '', `/room/${state.currentRoom}`);
    
    // Save player name to local storage for this room
    state.sessionStorage.setItem(`poker_player_${state.currentRoom}`, state.playerName);
    
    // Update room display
    roomIdDisplay.textContent = state.currentRoom;
    
    // Show creator controls if needed
    if (state.isCreator) {
        creatorControls.classList.remove('hidden');
    } else {
        creatorControls.classList.add('hidden');
    }
    
    // Hide home screen, show room screen
    homeScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');
    
    // Connect to event source
    connectEventSource();
}

function connectEventSource() {
    // Close existing connection if any
    if (state.eventSource) {
        state.eventSource.close();
    }
    
    // Create new event source
    state.eventSource = new EventSource(`/api/rooms/${state.currentRoom}/events?name=${encodeURIComponent(state.playerName)}`);
    
    // Handle room events
    state.eventSource.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        handleRoomEvent(data);
    });
    
    // Handle connection error
    state.eventSource.addEventListener('error', () => {
        // Try to reconnect after 5 seconds
        setTimeout(() => {
            if (state.currentRoom) {
                connectEventSource();
            }
        }, 5000);
    });
}

function handleRoomEvent(event) {
    const { type, payload } = event;
    
    switch (type) {
        case 'initial_state':
            updateRoomState(payload);
            break;
        case 'player_joined':
            showNotification(`${payload.name} joined the room`);
            // Refresh the room state to show the new player
            fetch(`/api/rooms/${state.currentRoom}?name=${encodeURIComponent(state.playerName)}`)
                .then(response => response.json())
                .then(room => updateRoomState(room))
                .catch(error => console.error('Error refreshing room state:', error));
            break;
        case 'player_left':
            showNotification(`${payload.name} left the room`);
            // Refresh the room state to remove the player
            fetch(`/api/rooms/${state.currentRoom}?name=${encodeURIComponent(state.playerName)}`)
                .then(response => response.json())
                .then(room => updateRoomState(room))
                .catch(error => console.error('Error refreshing room state:', error));
            break;
        case 'vote_submitted':
            showNotification(`${payload.name} submitted a vote`);
            // Refresh the room state to update the vote indicators
            fetch(`/api/rooms/${state.currentRoom}?name=${encodeURIComponent(state.playerName)}`)
                .then(response => response.json())
                .then(room => updateRoomState(room))
                .catch(error => console.error('Error refreshing room state:', error));
            break;
        case 'cards_revealed':
            updateRoomState(payload);
            showNotification('Cards revealed!');
            break;
        case 'voting_reset':
            updateRoomState(payload);
            showNotification('Voting has been reset');
            state.selectedCard = null;
            updateCardSelection();
            break;
        case 'link_updated':
            // Update input field for creator
            if (state.isCreator) {
                sessionLinkInput.value = payload.link;
            }
            
            // Update display for all participants
            updateLinkDisplay(payload.link);
            
            showNotification('Link updated');
            break;
    }
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
    }
    
    // Update the session link display for all participants
    updateLinkDisplay(room.link);
    
    // Update link input if we're the creator
    if (state.isCreator && room.link) {
        sessionLinkInput.value = room.link;
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
        
        const playerName = document.createElement('div');
        playerName.className = 'player-name';
        playerName.textContent = player.name === state.playerName ? `${player.name} (You)` : player.name;
        
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
        } else if (player.name === state.playerName) {
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

function shareRoom() {
    if (!state.currentRoom) return;
    
    const roomURL = `${window.location.origin}/room/${state.currentRoom}`;
    
    // Try to use the clipboard API if available
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(roomURL)
            .then(() => {
                showNotification('Room link copied to clipboard', false);
            })
            .catch(() => {
                // Fallback
                prompt('Copy the room link:', roomURL);
            });
    } else {
        // Fallback for browsers without clipboard API
        prompt('Copy the room link:', roomURL);
    }
}

// Reset the application state
function resetState() {
    // Remove from local storage
    if (state.currentRoom) {
        state.sessionStorage.removeItem(`poker_player_${state.currentRoom}`);
    }
    
    // Reset state variables
    state.currentRoom = null;
    state.playerName = '';
    state.isCreator = false;
    state.selectedCard = null;
    state.roomStatus = 'voting';
    
    if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
    }
    
    // Clear displayed cards
    const selectedCards = document.querySelectorAll('.card-btn.selected');
    selectedCards.forEach(card => card.classList.remove('selected'));
    
    // Clear players
    playersContainer.innerHTML = '';
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
        
        if (savedPlayerName) {
            // Auto-join with saved name
            state.currentRoom = roomId;
            state.playerName = savedPlayerName;
            
            // Attempt to rejoin the room
            rejoinRoom(roomId, savedPlayerName);
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
        
        const data = await response.json();
        
        if (!response.ok) {
            // If rejoining fails, prompt for a new name
            showRoomJoinPrompt(roomId);
            return;
        }
        
        // Successfully rejoined, enter the room
        enterRoom();
        
    } catch (error) {
        showNotification(error.message, true);
        showRoomJoinPrompt(roomId);
    }
}

// Check URL for room ID on page load
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
        roomIdInput.value = roomId;
        playerNameInput.focus();
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (state.currentRoom && state.playerName) {
        // Try to leave the room gracefully
        fetch(`/api/rooms/${state.currentRoom}/leave?name=${encodeURIComponent(state.playerName)}`, {
            method: 'GET',
            keepalive: true
        });
    }
});

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