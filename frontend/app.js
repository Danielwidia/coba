const questions = [
    {
        text: "What is 2 + 2?",
        options: ["3", "4", "5", "6"],
        answer: 1
    },
    {
        text: "What is the capital of France?",
        options: ["London", "Berlin", "Paris", "Rome"],
        answer: 2
    }
];

let currentIndex = 0;

function renderQuestion() {
    const container = document.getElementById('question-container');
    const q = questions[currentIndex];
    container.innerHTML = `<p>${q.text}</p>`;
    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.onclick = () => selectOption(i);
        container.appendChild(btn);
    });
}

function selectOption(index) {
    const q = questions[currentIndex];
    if (index === q.answer) {
        alert('Correct!');
    } else {
        alert('Wrong');
    }
}

document.getElementById('prev-btn').onclick = () => {
    if (currentIndex > 0) {
        currentIndex--;
        renderQuestion();
    }
};

document.getElementById('next-btn').onclick = () => {
    if (currentIndex < questions.length - 1) {
        currentIndex++;
        renderQuestion();
    }
};

renderQuestion();