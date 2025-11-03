 // Elements
    const notesList = document.getElementById("notesList");
    const newNoteBtn = document.getElementById("newNoteBtn");
    const noteTitle = document.getElementById("noteTitle");
    const noteContent = document.getElementById("noteContent");
    const deleteNoteBtn = document.getElementById("deleteNoteBtn");

    // State
    const allNotes = {};
    let noteId = 0;
    let currentNoteId = null;

    // Create a new note
    function createNote() {
      allNotes[noteId] = {
        id: noteId,
        title: "Untitled",
        content: "",
      };

      renderNotesList();
      loadNote(noteId);
      noteId++;
    }

    // Load a note by ID into the editor
    function loadNote(id) {
      const note = allNotes[id];
      if (!note) return;

      currentNoteId = id;
      noteTitle.value = note.title;
      noteContent.value = note.content;

      document.querySelectorAll(".note-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.key === id);
      });
    }

    // Render notes list
    function renderNotesList() {
      notesList.innerHTML = "";

      for (const id in allNotes) {
        const note = allNotes[id];
        const item = document.createElement("div");
        item.className = "note-item";
        item.dataset.key = id;
        item.textContent = note.title || "Untitled";
        item.onclick = () => loadNote(id);
        notesList.appendChild(item);
      }

      // Keep current note highlighted
      if (currentNoteId !== null) {
        document
          .querySelectorAll(".note-item")
          .forEach((item) =>
            item.classList.toggle(
              "active",
              Number(item.dataset.key) === currentNoteId
            )
          );
      }
    }

    // Auto-save changes
    function autoSave() {
      if (currentNoteId === null) return;

      const note = allNotes[currentNoteId];
      note.title = noteTitle.value.trim() || "Untitled";
      note.content = noteContent.value;

      const activeItem = document.querySelector(
        `.note-item[data-key="${currentNoteId}"]`
      );
      if (activeItem) activeItem.textContent = note.title;
    }

    function deleteNotes() {
      console.log(currentNoteId);
      delete allNotes[currentNoteId];

      currentNoteId = null;
      noteTitle.value = "";
      noteContent.value = "";
      renderNotesList();
    }

    // Event listeners
    newNoteBtn.onclick = createNote;
    noteTitle.addEventListener("input", autoSave);
    noteContent.addEventListener("input", autoSave);
    deleteNoteBtn.onclick = deleteNotes;
    createNote();