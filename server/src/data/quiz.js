'use strict';

// Вопросы викторины. correct — индекс верного варианта, наружу не отдаётся.
const QUIZ_QUESTIONS = [
  { q: 'Что значит QR-код?', options: ['Quick Response', 'Quality Record', 'Quick Record'], correct: 0 },
  { q: 'Какой формат файла лучше для фото без потери качества?', options: ['JPG', 'PNG', 'MP4'], correct: 1 },
  { q: 'Что такое стриминг?', options: ['Запись видео', 'Передача видео в реальном времени', 'Монтаж'], correct: 1 },
  { q: 'Какой цвет у освещения «тёплый свет»?', options: ['Синий', 'Оранжевый/жёлтый', 'Зелёный'], correct: 1 },
  { q: 'Что означает слово «контент»?', options: ['Наполнение/материал', 'Камера', 'Микрофон'], correct: 0 },
];

function publicQuestions() {
  return QUIZ_QUESTIONS.map((item) => ({ q: item.q, options: item.options.slice() }));
}

function scoreAnswers(answers) {
  let correct = 0;
  QUIZ_QUESTIONS.forEach((item, index) => {
    if (Number(answers[index]) === item.correct) correct += 1;
  });
  return { correct, total: QUIZ_QUESTIONS.length };
}

module.exports = { QUIZ_QUESTIONS, publicQuestions, scoreAnswers };
