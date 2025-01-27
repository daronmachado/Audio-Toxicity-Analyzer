  // Speech Recognition Variables
  const toggleSpeechRecBtn = document.getElementById('toggle-speech-rec-btn');
  const speechOutput = document.getElementById('speech-output');
  let isListening = false;
  let recognition;
  
  // Check for Speech Recognition support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
  
    // Process the recognized speech and display it
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      speechOutput.textContent = transcript.trim();
    };
  
    // Toggle listening
    toggleSpeechRecBtn.addEventListener('click', async () => {
      if (isListening) {
        recognition.stop();
        // console.log(`speechOutput : ${speechOutput.textContent}`)
        try {
          const response = await fetch("/webAnalyze", {
            method: "POST",
            body: speechOutput.textContent
        });

        const result = await response.json();
        displayResults(result);
          
        } catch (e) {
          console.log(e);
        }
        toggleSpeechRecBtn.textContent = '🎤 Start Listening';
      } else {
        recognition.start();
        toggleSpeechRecBtn.textContent = '🔴 Stop Listening';
      }
      isListening = !isListening;
    });
  } else {
    speechOutput.textContent = 'Web Speech API not supported in this browser.';
    toggleSpeechRecBtn.disabled = true;
  }
  
////////////////////////////////
function displayResults(result) {
  const bertResultElement = document.querySelector("#resultContent code");
  const toxicityStatusElement = document.getElementById("toxicityStatus");
  const modelName = document.querySelector("#modelName");

  let scores = [];
  let labels = [];
  // modelName.innerText = "PERSPECTIVE RESULTS";
  const perspectiveResults = result.results.attributeScores;

  // Normalize scores
  const rawScores = Object.entries(perspectiveResults).map(([key, data]) => ({
      label: key,
      score: data.summaryScore.value,
  }));
  const totalScore = rawScores.reduce((sum, item) => sum + item.score, 0);
  if (totalScore > 0) {
      const normalizedScores = rawScores.map(item => ({
          label: item.label,
          normalizedScore: (item.score / totalScore) * 100,
      }));

      let formattedResults = "";
      scores = normalizedScores.map(item => item.normalizedScore);
      labels = normalizedScores.map(item => item.label);
      normalizedScores.forEach(({ label, normalizedScore }) => {
          formattedResults += `- ${label}: ${normalizedScore.toFixed(2)}%\n`;
      });
      bertResultElement.innerText = formattedResults;
  } else {
      bertResultElement.innerText = "No significant attributes detected.";
  }
  
  const severeToxicityScore =result.results?.attributeScores?.SEVERE_TOXICITY?.summaryScore?.value || 0;

  if (severeToxicityScore !== undefined) {
  const status = severeToxicityScore > 0.15 ? "Toxic" : "Non-Toxic";
  const statusColor = severeToxicityScore > 0.15 ? "red" : "green";
  toxicityStatusElement.innerHTML = `<span style="color: ${statusColor}; font-weight: bold;">${status}</span>`;
  } else {    
  toxicityStatusElement.innerText = "Toxicity status unavailable.";
  }
}
////////////////////////////////


  // Text-to-Speech Variables
  const ttsInput = document.getElementById('tts-input');
  const toggleTTSBtn = document.getElementById('toggle-tts-btn');
  const voiceSelect = document.getElementById('voice-select');
  let synth = window.speechSynthesis;
  let voices = [];
  let isSpeaking = false;
  
  // Populate available voices for TTS
  function populateVoices() {
    voices = synth.getVoices();
    voiceSelect.innerHTML = voices
      .map((voice, index) => `<option value="${index}">${voice.name} (${voice.lang})</option>`)
      .join('');
  }
  
  populateVoices();
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoices;
  }
  
  // Text-to-Speech Function
  function speakText(text) {
    if (synth.speaking) {
      console.error('Already speaking...');
      return;
    }
    if (text !== '') {
      const utterance = new SpeechSynthesisUtterance(text);
      const selectedVoiceIndex = voiceSelect.value;
      utterance.voice = voices[selectedVoiceIndex];
      synth.speak(utterance);
  
      utterance.onend = () => {
        console.log('Speech finished');
        toggleTTSBtn.textContent = '🗣️ Speak Text';
        isSpeaking = false;
      };
  
      utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance error', event);
        isSpeaking = false;
      };
    }
  }
  
  // Toggle TTS functionality
  toggleTTSBtn.addEventListener('click', () => {
    if (!isSpeaking) {
      const text = ttsInput.value;
      speakText(text);
      toggleTTSBtn.textContent = '🔴 Stop Speaking';
    } else {
      synth.cancel();
      toggleTTSBtn.textContent = '🗣️ Speak Text';
    }
    isSpeaking = !isSpeaking;
  });