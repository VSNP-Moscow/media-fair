/* ================= Медиаярмарка — Змейка ================= */
const Snake = (function(){
  const canvas = document.getElementById('snakeCanvas');
  const scoreEl = document.getElementById('snakeScore');
  const bestEl = document.getElementById('snakeBest');
  const msgEl = document.getElementById('snakeMsg');
  const btnStart = document.getElementById('btnSnakeStart');
  const btnSave = document.getElementById('btnSnakeSave');

  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  const grid = 20;
  const count = canvas.width / grid;

  let snake, food, dir, nextDir, score, running, id, frame = 0;
  let best = Number(localStorage.getItem('mf_snake_best') || 0);
  bestEl.textContent = best;

  function reset(){
    snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
    dir = {x:1,y:0}; nextDir = {x:1,y:0};
    score = 0; scoreEl.textContent = '0';
    placeFood();
    running = true;
    msgEl.textContent = '';
    if (id) cancelAnimationFrame(id);
    loop();
  }
  function placeFood(){
    food = {x: Math.floor(Math.random()*count), y: Math.floor(Math.random()*count)};
    if (snake.some(s => s.x === food.x && s.y === food.y)) placeFood();
  }
  function loop(){
    if (!running) return;
    // ограничиваем скорость: шаг каждые 8 кадров (~7-8 клеток в секунду)
    frame++;
    if (frame % 8 !== 0) { id = requestAnimationFrame(loop); return; }
    dir = nextDir;
    const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};

    if (head.x < 0 || head.x >= count || head.y < 0 || head.y >= count ||
        snake.some(s => s.x === head.x && s.y === head.y)){
      running = false;
      msgEl.textContent = 'Игра окончена! Очки: ' + score;
      if (score > best) { best = score; bestEl.textContent = best; localStorage.setItem('mf_snake_best', best); msgEl.textContent += ' — НОВЫЙ РЕКОРД!'; }
      return;
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y){ score += 1; scoreEl.textContent = score; placeFood(); }
    else snake.pop();

    draw();
    id = requestAnimationFrame(loop);
  }
  function draw(){
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // еда
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(food.x*grid+1, food.y*grid+1, grid-2, grid-2);
    // змея
    snake.forEach((s,i)=>{
      ctx.fillStyle = i===0 ? '#22c55e' : '#4ade80';
      ctx.fillRect(s.x*grid+1, s.y*grid+1, grid-2, grid-2);
    });
  }
  function setDir(key){
    if (!running) return;
    const map = { ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0} };
    const d = map[key]; if (!d) return;
    // нельзя развернуться на 180
    if ((d.x === -dir.x && d.y === -dir.y) || (d.x === dir.x && d.y === dir.y)) return;
    nextDir = d;
  }

  window.addEventListener('keydown', e => { if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); setDir(e.key); } });
  document.querySelectorAll('.ctrl-btn').forEach(b => b.addEventListener('click', () => setDir(b.dataset.key)));
  btnStart.addEventListener('click', reset);

  return {
    getScore: () => score,
    isRunning: () => running,
    start: reset,
  };
})();
