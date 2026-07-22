
const canvas = document.getElementById("gameCanvas");
const context = canvas.getContext("2d");
const width = canvas.getAttribute("width");
const height = canvas.getAttribute("height");
let gravity = 0.2;
let bounce = 0.8;
let bounceValue = document.getElementById("bounceValue");
let gravityValue = document.getElementById("gravityValue");

class Game {
    constructor(n_obstacles) {
        this.obstacles = [];
        this.gameball = new GameBall();
        this.tries = 0;

        for (let i = 0; i < n_obstacles; i++) {
            let r = Math.floor(Math.random()*200+55);
            let g = Math.floor(Math.random()*200+55);
            let b = Math.floor(Math.random()*200+55);
            let radius = 20+Math.random()*50
            let obstacle = new Obstacle(radius + Math.random()*(width-(2*radius)), 80+radius+Math.random()*(height-(2*radius)-80), radius, r, g, b);
            obstacle.draw(this.gameball);
            this.obstacles.push(obstacle);
            //this.checkOverlap(obstacle);
        }
    }

    checkOverlap(obstacle) {
        if (this.obstacles.length > 1) {
            this.obstacles.forEach(o => {
                if (Math.sqrt(Math.pow(o.position.y-obstacle.position.y, 2)+Math.pow(o.position.x-obstacle.position.x, 2)) < o.radius + obstacle.radius && o != obstacle) {
                    let angle = Math.atan2(o.position.y-obstacle.position.y, o.position.x-obstacle.position.x);
                    o.position.rotate(true, angle);
                    obstacle.position.rotate(true, angle);

                    let overlap = o.radius + obstacle.radius - Math.sqrt(Math.pow(o.position.y-obstacle.position.y, 2)+Math.pow(o.position.x-obstacle.position.x, 2));
                    if (o.position.x > obstacle.position.x) {
                        o.position.x += overlap/2;
                        obstacle.position.x -= overlap/2;
                    } else {
                        o.position.x -= overlap/2;
                        obstacle.position.x += overlap/2;
                    }

                    o.position.rotate(false, angle);
                    obstacle.position.rotate(false, angle);
                }
            })
        }
    }
}

class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    rotate(forward, angle) {
        if (forward) {
            let x = this.x * Math.cos(angle) + this.y*Math.sin(angle);
            let y = this.y * Math.cos(angle) - this.x*Math.sin(angle);
            this.x = x;
            this.y = y;
        } else {
            let x = this.x * Math.cos(angle) - this.y*Math.sin(angle);
            let y = this.y * Math.cos(angle) + this.x*Math.sin(angle);
            this.x = x;
            this.y = y;
        }
    }
}

class Circle {
    constructor(x, y, radius) {
        
        this.position = new Vector(x, y);
        this.radius = radius;
    }
}

class Obstacle extends Circle {
    constructor(x, y, radius, r, g, b) {
        super(x, y, radius);
        this.number = 10;
        this.red = r;
        this.green = g;
        this.blue = b;

    }

    draw(ball) {
        if (this.number > 0) {
            let ctx = canvas.getContext("2d");
            ctx.beginPath();
            ctx.strokeStyle = `rgb(${this.red}, ${this.green}, ${this.blue})`;
            ctx.arc(this.position.x, this.position.y, this.radius, 0, 2*Math.PI);
            ctx.stroke();
            ctx.fillStyle = `rgb(${this.red}, ${this.green}, ${this.blue})`;
            ctx.font = (this.radius/2) + "px Arial";
            ctx.fillText(this.number, this.position.x - this.radius/2, this.position.y);
            this.checkBallCollision(ball);
        }
    }

    checkBallCollision(ball) {
        let distance = Math.sqrt(Math.pow(ball.position.x - this.position.x, 2) + Math.pow(ball.position.y - this.position.y, 2));
        if (distance < ball.radius + this.radius) {
            let overlap = ball.radius + this.radius - distance;
            let angle = Math.atan2((ball.position.y-this.position.y), (ball.position.x-this.position.x));
            ball.position.rotate(true, angle);
            this.position.rotate(true, angle);
            ball.speed.rotate(true, angle);

            if (ball.position.x > this.position.x) ball.position.x += overlap;
            else ball.position.x -= overlap;

            ball.speed.x = -ball.speed.x*bounce;

            ball.position.rotate(false, angle);
            this.position.rotate(false, angle);
            ball.speed.rotate(false, angle);
            this.number--;
        }
    }
}

class GameBall extends Circle {
    constructor() {
        let radius = 20;
        super(width/2, radius, radius);
        this.speed = new Vector(0, 0);
        this.shootable = true;
    }

    draw(game) {
        let ctx = canvas.getContext("2d");
        ctx.beginPath();
        ctx.fillStyle = "cadetblue";
        ctx.arc(this.position.x, this.position.y, this.radius, 0, 2*Math.PI);
        ctx.fill();
        this.move(game);
    }

    move(game) {
        if (this.shootable) {
            this.position.x = width/2;
            this.position.y = this.radius;
            this.speed.x = 0;
            this.speed.y = 0;
        } else {
            this.position.x += this.speed.x;
            this.position.y += this.speed.y;
            this.speed.y += gravity;
        }

        if (this.position.x > width - this.radius) {
            this.position.x = width - this.radius;
            this.speed.x = -this.speed.x*bounce;
        }
        if (this.position.x < this.radius) {
            this.position.x = this.radius;
            this.speed.x = -this.speed.x*bounce;
        }
        if (this.position.y < this.radius) {
            this.position.y = this.radius;
            this.speed.y = -this.speed.y * bounce;
        }
        let border = 620;
        if (this.position.y > border) {
            this.shootable = true;
            checkDone(game);
        }
    }
}

let gameover = false;
let mouseX, mouseY;

let range = document.getElementById("bounce");
bounceValue.innerText = range.value + "%";

let rangeGravity = document.getElementById("gravity");
gravityValue.innerText = rangeGravity.value + "%";

function changeValue() {
    bounceValue.innerText = range.value + "%";
}

function changeGravity() {
    gravityValue.innerText = rangeGravity.value + "%";
}

function reset() {
    clearInterval(interval);
    context.fillStyle = "rgb(32, 32, 32)";
    context.fillRect(0, 0, width, height);
    let w = width;
    canvas.width = 1;
    canvas.width = w;
}


let game;
let interval;

function startGame() {
    reset();
    gameover = false;

    document.querySelector("h2.fertig").className = "fertig";
    document.getElementById("tries").innerHTML = "Versuche: 0";

    bounce = range.value/100;
    gravity = rangeGravity.value/100;
    game = new Game(15);
    console.log(game.tries);

    interval = setInterval(function () {
        if (!gameover) {
            updateCanvas(game);
        } else {
            clearInterval(interval);
        }
    }, 20);

    canvas.addEventListener('mousemove', e=>{
        let rect = e.target.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    })

    canvas.addEventListener("click", e => {
        if(!gameover && game.gameball.shootable){
            let rect = e.target.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top
            game.gameball.shootable = false;
            game.gameball.speed.x = (mouseX-(width/2))/10;
            game.gameball.speed.y = (mouseY-20)/10;
            document.getElementById("tries").innerText = `Versuche: ${++game.tries}`;
        }
    })

}

function drawArrow(x, y) {
    let ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(width/2, 20);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "white";
    ctx.stroke();
}

function updateCanvas(game) {
    let gameball = game.gameball;
    context.fillStyle = "rgb(32, 32, 32)";
    context.fillRect(0, 0, width, height);
    gameball.draw(game);
    game.obstacles.forEach(o => {
        o.draw(gameball);
    });
    if (game.gameball.shootable) {
        drawArrow(mouseX, mouseY);
        
    }
}

function checkDone(game) {
    let done = true;
    game.obstacles.forEach(o => {
        if (o.number > 0) done = false;
    })

    if (done) {
        gameover = true;
        context.fillStyle = "rgb(32, 32, 32)";
        context.fillRect(0, 0, width, height);
        document.querySelector("h2.fertig").className = "fertig done";
    }
}

startGame();