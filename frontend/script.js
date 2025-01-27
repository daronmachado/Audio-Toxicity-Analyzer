let chartInstance = null; // Track the current chart instance

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById("audioFile");
    const modelSelect = document.getElementById("model");
    const loading = document.getElementById("loading");
    const resultContent = document.getElementById("resultContent");
    const bertResultElement = resultContent.querySelector("code");
    const transcribedTextElement = document.getElementById("transcribedText");
    const toxicWordsElement = document.getElementById("toxicWords");
    const toxicityStatusElement = document.getElementById("toxicityStatus");
    const file = fileInput.files[0];
    const model = modelSelect.value;

    if (!file) {
        alert("Please upload a file!");
        return;
    }

    // Clear previous results
    bertResultElement.innerText = "";
    transcribedTextElement.innerText = "";
    toxicWordsElement.innerText = "";
    toxicityStatusElement.innerText = "";
    resultContent.classList.add("hidden");
    clearChart(); // Ensure the chart is reset

    // Show loading state
    loading.classList.remove("hidden");

    const formData = new FormData();
    formData.append("audioFile", file);
    formData.append("model", model);

    try {
        const response = await fetch("/analyze", {
            method: "POST",
            body: formData,
        });

        const result = await response.json();

        // Hide loading
        loading.classList.add("hidden");

        if (response.ok) {
            resultContent.classList.remove("hidden");

            if (model === "bert" && result.bert_results) {
                displayResults(result, "bert");
            } else if (model === "perspective" && result.perspective_results) {
                displayResults(result, "perspective");
            } else {
                throw new Error("Invalid results received from the server.");
            }
        } else {
            throw new Error(result.error || "Analysis failed");
        }
    } catch (error) {
        loading.classList.add("hidden");
        alert(`An error occurred: ${error.message}`);
    }
});

// Function to display results
function displayResults(result, model) {
    const bertResultElement = document.querySelector("#resultContent code");
    const transcribedTextElement = document.getElementById("transcribedText");
    const toxicWordsElement = document.getElementById("toxicWords");
    const toxicityStatusElement = document.getElementById("toxicityStatus");
    const modelName = document.querySelector("#modelName");

    let scores = [];
    let labels = [];

    // Process and display normalized results
    if (model === "bert") {
        modelName.innerText = "BERT RESULTS";
        const bertResults = result.bert_results;
        let formattedResults = "";
        scores = Object.values(bertResults);
        labels = Object.keys(bertResults);
        for (const [key, value] of Object.entries(bertResults)) {
            formattedResults += `- ${key}: ${(value).toFixed(2)}%\n`;
        }
        bertResultElement.innerText = formattedResults;
    } else if (model === "perspective") {
        modelName.innerText = "PERSPECTIVE RESULTS";
        const perspectiveResults = result.perspective_results.attributeScores;

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
    }

    // Highlight toxic words in transcribed text
    let transcribedText = result.transcribed_text;
    const toxicWords = result.toxic_words;

    toxicWords.forEach((word) => {
        const regex = new RegExp(`\\b${word}\\b`, "gi");
        transcribedText = transcribedText.replace(
            regex,
            `<span style="color: red; font-weight: bold;">${word}</span>`
        );
    });
    
    transcribedTextElement.innerHTML = transcribedText;

    // Update toxic words
    if (toxicWords && toxicWords.length > 0) {
        toxicWordsElement.innerText = toxicWords.join(", ");
    } else {
        toxicWordsElement.innerText = "No toxic words detected.";
    }

    // Calculate and display toxicity status
    // Calculate and display toxicity status
    const severeToxicityScore =
    model === "bert"
        ? result.bert_results?.severe_toxicity || 0
        : result.perspective_results?.attributeScores?.SEVERE_TOXICITY?.summaryScore?.value || 0;

    if (severeToxicityScore !== undefined) {
    const status = severeToxicityScore > 0.15 ? "Toxic" : "Non-Toxic";
    const statusColor = severeToxicityScore > 0.15 ? "red" : "green";
    toxicityStatusElement.innerHTML = `<span style="color: ${statusColor}; font-weight: bold;">${status}</span>`;
    } else {    
    toxicityStatusElement.innerText = "Toxicity status unavailable.";
    }


    // Create pie chart
    if (scores.length > 0 && labels.length > 0) {
        createChart(labels, scores);
    }
}

// Clear existing chart
function clearChart() {
    if (chartInstance) {
        chartInstance.destroy(); // Destroy the existing chart instance
        chartInstance = null;
    }
}

// Create pie chart
function createChart(labels, scores) {
    const chartContext = document.getElementById("pieChart").getContext("2d");
    chartInstance = new Chart(chartContext, {
        type: "pie",
        data: {
            labels: labels,
            datasets: [
                {
                    data: scores,
                    backgroundColor: [
                        "#4caf50",
                        "#2196f3",
                        "#ff5722",
                        "#ffeb3b",
                        "#9c27b0",
                        "#e91e63",
                    ],
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: "top",
                    labels: {
                        color: "#ffffff",
                    },
                },
            },
        },
    });
}
