const audioFileInput = document.getElementById("audioFile");
    const sendAudioButton = document.getElementById("sendAudioBtn");

    audioFileInput.addEventListener("change", function () {
      const audioFile = audioFileInput.files[0];
      const selectedAudioDisplay = document.getElementById("selectedAudioDisplay");
    
      // Clear existing content
      selectedAudioDisplay.innerHTML = "";
    
      if (audioFile) {
        // Create and display the file name
        const fileNameElement = document.createElement("p");
        fileNameElement.textContent = audioFile.name;
        fileNameElement.style.fontWeight = "bold";
        fileNameElement.style.marginBottom = "5px";
        selectedAudioDisplay.appendChild(fileNameElement);
    
        // Create and display the audio element
        // const audioElement = document.createElement("audio");
        // audioElement.controls = true;
        // audioElement.src = URL.createObjectURL(audioFile);
        // audioElement.style.maxWidth = "100%";
        // selectedAudioDisplay.appendChild(audioElement);
        // console.log(audioElement)
      } else {
        // Display placeholder text if no file is selected
        selectedAudioDisplay.textContent = "No file selected";
      }
    });
    


    sendAudioButton.addEventListener("click", function () {
      const audioFile = audioFileInput.files[0];
      if (!audioFile) {
        alert("Please select an audio file!");
        return;
      }

      document.getElementById("loadingSpinner").style.display = "inline-block";
      const formData = new FormData();
      formData.append("audioFile", audioFile);

      fetch("/analyzeChat", {
        method: "POST",
        body: formData,
      })
        .then(response => response.json())
        .then(data => {
          document.getElementById("loadingSpinner").style.display = "none";
          selectedAudioDisplay.innerHTML = "";
          if (data.result === false) {
            displayAudioInChat(audioFile.name, audioFile);
          } else if (data.toxicWords && data.toxicWords.length > 0) {
            alert("Bad words found: " + data.toxicWords.join(", "));
          }
        })
        .catch(err => {
          document.getElementById("loadingSpinner").style.display = "none";
          console.error("Error:", err);
          alert("An error occurred while processing the audio file.");
        });
    });

    function displayAudioInChat(songName, audioFile) {
      const chatBox = document.querySelector(".chat-box");

      const messageElement = document.createElement("div");
      messageElement.classList.add("message", "user");

      const songNameElement = document.createElement("p");
      songNameElement.textContent = songName;
      songNameElement.style.marginBottom = "5px";
      songNameElement.style.fontWeight = "bold";

      const audioElement = document.createElement("audio");
      audioElement.controls = true;
      audioElement.src = URL.createObjectURL(audioFile);
      audioElement.style.maxWidth = "100%";

      messageElement.appendChild(songNameElement);
      messageElement.appendChild(audioElement);
      chatBox.appendChild(messageElement);
      chatBox.scrollTop = chatBox.scrollHeight;
    }