// =========================================================================
// NEW ELEMENTS & RENAME HANDLERS (Add this section to your existing chat.js)
// =========================================================================

// Assuming 'socket' is defined as: const socket = io();
// Assuming 'username' is defined as: let username = '';

// New Rename feature elements
const renameForm = document.getElementById('rename-form');
const newNameInput = document.getElementById('new-name-input');
const renameModalEl = document.getElementById('renameModal'); // The Bootstrap Modal element
// Requires Bootstrap to be loaded to instantiate the modal
const renameModal = new bootstrap.Modal(renameModalEl); 

// Listener for the rename form submission
renameForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const newName = newNameInput.value.trim();
    
    // Basic validation
    if (newName && newName.length <= 20) { 
        handleRename(newName);
    } else {
        alert('Please enter a valid name (1-20 characters).');
    }
});

// Function to handle the renaming process
function handleRename(newName) {
    // Prevent renaming to the current name
    if (newName === username) {
        renameModal.hide();
        return;
    }

    // Emit the new name to the server
    // The server must listen for 'rename' and send a callback response (success/failure)
    socket.emit('rename', newName, function(success) {
        if (success) {
            // Update client-side display elements
            const displayNameSpan = document.getElementById('display-name');
            displayNameSpan.textContent = newName;
            
            // IMPORTANT: Update the global username variable
            username = newName; 

            // Clear the input and close the modal
            newNameInput.value = '';
            renameModal.hide(); 
        } else {
            // Error handling from the server (e.g., name taken)
            alert('Rename failed. The name might be taken or invalid.');
        }
    });
}
// =========================================================================
