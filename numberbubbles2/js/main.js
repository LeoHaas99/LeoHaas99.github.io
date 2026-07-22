// Configuration
const CONFIG = {
    CANVAS: {
        BACKGROUND: 'rgb(32, 32, 32)',
        WIDTH: document.querySelector('#gameCanvas').getAttribute('width'),
        HEIGHT: document.querySelector('#gameCanvas').getAttribute('height')
    },
    GAME: {
        BALL_COLOR: '#ffffff',
        BALL_RADIUS: 20,
        BORDER_LIMIT: 620,
        NUM_OBSTACLES: 15,
        SHOOT_SPEED_DIVISOR: 10,
        MIN_OBSTACLE_RADIUS: 20,
        MAX_OBSTACLE_RADIUS: 50,
        MIN_OBSTACLE_COLOR: 55,
        MAX_OBSTACLE_COLOR: 180,
        DEFAULT_GRAVITY: 0.2,
        DEFAULT_BOUNCE: 0.8,
        OBSTACLE_PADDING: 5,
        MAX_PLACEMENT_ATTEMPTS: 100,
        MAX_SPEED: 25
    }
}

// Game engine class to handle core functionality
class GameEngine {
    constructor() {
        this.canvas = document.querySelector('#gameCanvas')
        this.context = this.canvas.getContext('2d')
        this.mousePosition = { x: 0, y: 0 }
        this.game = null
        this.animationFrame = null
        this.isGameOver = false

        this.ui = {
            bounce: {
                value: document.querySelector('#bounceValue'),
                range: document.querySelector('#bounce')
            },
            gravity: {
                value: document.querySelector('#gravityValue'),
                range: document.querySelector('#gravity')
            },
            tries: document.getElementById('tries'),
            doneText: document.querySelector('h2.doneText'),
            resetButton: document.getElementById('resetButton')
        }

        this.physics = {
            gravity: CONFIG.GAME.DEFAULT_GRAVITY,
            bounce: CONFIG.GAME.DEFAULT_BOUNCE
        }

        this.initializeUI()
        this.bindEvents()
    }

    initializeUI() {
        this.ui.bounce.value.innerText = `${this.ui.bounce.range.value}%`
        this.ui.gravity.value.innerText = `${this.ui.gravity.range.value}%`
    }

    bindEvents() {
        this.ui.resetButton.addEventListener('click', () => this.startGame())
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e))
        this.canvas.addEventListener('click', (e) => this.handleClick(e))
        this.ui.bounce.range.addEventListener('change', () => {
            this.ui.bounce.value.innerText = `${this.ui.bounce.range.value}%`
            CONFIG.GAME.DEFAULT_BOUNCE = this.ui.bounce.range.value
            this.physics.gravity = CONFIG.GAME.DEFAULT_GRAVITY
        })

        this.ui.gravity.range.addEventListener('change', () => {
            this.ui.gravity.value.innerText = `${this.ui.gravity.range.value}%`
            CONFIG.GAME.DEFAULT_GRAVITY = this.ui.gravity.range.value
            this.physics.bounce = CONFIG.GAME.DEFAULT_BOUNCE
        })
    }

    startGame() {
        this.resetCanvas()
        this.isGameOver = false
        
        this.ui.doneText.className = 'doneText'
        this.ui.tries.innerHTML = 'Tries: 0'

        this.physics.bounce = this.ui.bounce.range.value / 100
        this.physics.gravity = this.ui.gravity.range.value / 100
        
        this.game = new Game(this)
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame)
        }
        
        this.startGameLoop()
    }

    startGameLoop() {
        const loop = () => {
            if (!this.isGameOver) {
                this.updateCanvas()
                this.animationFrame = requestAnimationFrame(loop)
            }
        }
        this.animationFrame = requestAnimationFrame(loop)
    }

    updateCanvas() {
        this.clearCanvas()
        this.game.draw()
        if (this.game.ball.shootable)
            this.drawAimArrow()
    }

    clearCanvas() {
        this.context.fillStyle = CONFIG.CANVAS.BACKGROUND
        this.context.fillRect(0, 0, CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT)
    }

    resetCanvas() {
        this.clearCanvas()
        const width = CONFIG.CANVAS.WIDTH
        this.canvas.width = 1
        this.canvas.width = width
    }

    drawAimArrow() {
        this.context.beginPath()
        this.context.strokeStyle = 'white'
        this.context.lineWidth = 3
        this.context.lineCap = 'round'
        this.context.moveTo(CONFIG.CANVAS.WIDTH/2, CONFIG.GAME.BALL_RADIUS)
        this.context.lineTo(this.mousePosition.x, this.mousePosition.y)
        this.context.stroke()
    }

    handleMouseMove(e) {
        const rect = e.target.getBoundingClientRect()
        this.mousePosition.x = e.clientX - rect.left
        this.mousePosition.y = e.clientY - rect.top
    }

    handleClick(e) {
        if (this.isGameOver || !this.game.ball.shootable)
            return

        const rect = e.target.getBoundingClientRect()
        this.mousePosition.x = e.clientX - rect.left
        this.mousePosition.y = e.clientY - rect.top

        this.game.shootBall(this.mousePosition)
    }
}

class Vector {
    constructor(x = 0, y = 0) {
        this.x = x
        this.y = y
    }

    rotate(angle, forward = true) {
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const [newX, newY] = forward ? 
            [this.x * cos + this.y * sin, this.y * cos - this.x * sin] :
            [this.x * cos - this.y * sin, this.y * cos + this.x * sin]
        this.x = newX
        this.y = newY
        return this
    }

    static distance(v1, v2) {
        return Math.hypot(v1.x - v2.x, v1.y - v2.y)
    }

    // Add new utility methods
    normalize() {
        const magnitude = Math.sqrt(this.x * this.x + this.y * this.y)
        if (magnitude > 0) {
            this.x /= magnitude
            this.y /= magnitude
        }
        return this
    }

    multiply(scalar) {
        this.x *= scalar
        this.y *= scalar
        return this
    }
}

class Ball {
    constructor(engine) {
        this.engine = engine
        this.position = new Vector(CONFIG.CANVAS.WIDTH/2, CONFIG.GAME.BALL_RADIUS)
        this.speed = new Vector()
        this.radius = CONFIG.GAME.BALL_RADIUS
        this.shootable = true
    }

    draw() {
        const { context } = this.engine
        context.beginPath()
        context.fillStyle = CONFIG.GAME.BALL_COLOR
        context.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2)
        context.fill()
        this.update()
    }

    update() {
        if (this.shootable) {
            this.reset()
        } else {
            this.applyPhysics()
            this.handleBoundaries()
            this.checkBottom()
        }
    }

    reset() {
        this.position = new Vector(CONFIG.CANVAS.WIDTH/2, CONFIG.GAME.BALL_RADIUS)
        this.speed = new Vector()
    }

    applyPhysics() {
        this.position.x += this.speed.x
        this.position.y += this.speed.y
        this.speed.y += this.engine.physics.gravity
        
        // Limit maximum speed
        const currentSpeed = Math.sqrt(this.speed.x * this.speed.x + this.speed.y * this.speed.y)
        if (currentSpeed > CONFIG.GAME.MAX_SPEED) {
            const scale = CONFIG.GAME.MAX_SPEED / currentSpeed
            this.speed.x *= scale
            this.speed.y *= scale
        }
    }

    handleBoundaries() {
        const bounce = this.engine.physics.bounce
        
        if (this.position.x < this.radius || this.position.x > CONFIG.CANVAS.WIDTH - this.radius) {
            this.position.x = Math.max(this.radius, Math.min(CONFIG.CANVAS.WIDTH - this.radius, this.position.x))
            this.speed.x *= -bounce
        }
        
        if (this.position.y < this.radius) {
            this.position.y = this.radius
            this.speed.y *= -bounce
        }
    }

    checkBottom() {
        if (this.position.y > CONFIG.GAME.BORDER_LIMIT) {
            this.shootable = true
            this.engine.game.checkCompletion()
        }
    }
}

class Obstacle {
    constructor(engine, x, y, radius, color) {
        this.engine = engine
        this.position = new Vector(x, y)
        this.radius = radius
        this.color = color
        this.number = 10
    }

    draw() {
        if (this.number <= 0)
            return

        const { context } = this.engine
        const obstacleColor = `rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`

        context.beginPath()
        context.lineWidth = 2
        context.fillStyle = obstacleColor
        context.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2)
        context.fill()

        context.fillStyle = '#ffffff'
        context.font = `bold ${this.radius/2}px Courier`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(this.number.toString(), this.position.x, this.position.y)

        this.checkCollision(this.engine.game.ball)
    }

    checkCollision(ball) {
        const distance = Vector.distance(ball.position, this.position)
        const minDistance = ball.radius + this.radius
        
        if (distance < minDistance) {
            // Calculate collision normal
            const normalX = (ball.position.x - this.position.x) / distance
            const normalY = (ball.position.y - this.position.y) / distance
            
            // Calculate relative velocity
            const relativeVelocityX = ball.speed.x
            const relativeVelocityY = ball.speed.y
            
            // Calculate velocity along the normal
            const velocityAlongNormal = (relativeVelocityX * normalX + relativeVelocityY * normalY)
            
            // Only resolve if objects are moving towards each other
            if (velocityAlongNormal < 0) {
                // Calculate restitution (bounce factor)
                const restitution = this.engine.physics.bounce
                
                // Calculate impulse scalar
                const j = -(1 + restitution) * velocityAlongNormal
                
                // Apply impulse
                ball.speed.x = relativeVelocityX + j * normalX
                ball.speed.y = relativeVelocityY + j * normalY
                
                // Move ball out of collision
                const overlap = minDistance - distance
                ball.position.x += overlap * normalX
                ball.position.y += overlap * normalY
                
                this.number--
            }
        }
    }
}

class Game {
    constructor(engine) {
        this.engine = engine
        this.obstacles = []
        this.ball = new Ball(engine)
        this.tries = 0
        this.createObstacles()
    }

    draw() {
        this.ball.draw()
        this.obstacles.forEach(obstacle => obstacle.draw())
    }

    createObstacles() {
        for (let i = 0; i < CONFIG.GAME.NUM_OBSTACLES; i++) {
            const obstacle = this.createSingleObstacle()
            if (!obstacle)
                break
            this.obstacles.push(obstacle)
        }
    }

    createSingleObstacle() {
        for (let attempt = 0; attempt < CONFIG.GAME.MAX_PLACEMENT_ATTEMPTS; attempt++) {
            const color = {
                r: Math.floor(Math.random() * (CONFIG.GAME.MAX_OBSTACLE_COLOR - CONFIG.GAME.MIN_OBSTACLE_COLOR) + CONFIG.GAME.MIN_OBSTACLE_COLOR),
                g: Math.floor(Math.random() * (CONFIG.GAME.MAX_OBSTACLE_COLOR - CONFIG.GAME.MIN_OBSTACLE_COLOR) + CONFIG.GAME.MIN_OBSTACLE_COLOR),
                b: Math.floor(Math.random() * (CONFIG.GAME.MAX_OBSTACLE_COLOR - CONFIG.GAME.MIN_OBSTACLE_COLOR) + CONFIG.GAME.MIN_OBSTACLE_COLOR)
            }

            const maxRadius = Math.min(CONFIG.GAME.MAX_OBSTACLE_RADIUS, (CONFIG.CANVAS.WIDTH - 2 * CONFIG.GAME.MIN_OBSTACLE_RADIUS) / 
                                         (Math.sqrt(CONFIG.GAME.NUM_OBSTACLES) * 2))
            const radius = CONFIG.GAME.MIN_OBSTACLE_RADIUS + Math.random() * (maxRadius - CONFIG.GAME.MIN_OBSTACLE_RADIUS)

            const position = this.getValidPosition(radius)
            if (position)
                return new Obstacle(this.engine, position.x, position.y, radius, color)
        }
        return null
    }

    getValidPosition(radius) {
        const padding = CONFIG.GAME.OBSTACLE_PADDING
        const minX = radius + padding
        const maxX = CONFIG.CANVAS.WIDTH - radius - padding
        const minY = 80 + radius + padding
        const maxY = CONFIG.CANVAS.HEIGHT - radius - padding

        const x = minX + Math.random() * (maxX - minX)
        const y = minY + Math.random() * (maxY - minY)

        if (this.isValidPosition(x, y, radius))
            return { x, y }

        return null
    }

    isValidPosition(x, y, radius) {
        const pos = new Vector(x, y)
        
        // Check collision with existing obstacles
        if (this.obstacles.some(obstacle => 
            Vector.distance(pos, obstacle.position) < (radius + obstacle.radius + CONFIG.GAME.OBSTACLE_PADDING))) {
            return false
        }

        // Check collision with ball spawn area
        if (Vector.distance(pos, new Vector(CONFIG.CANVAS.WIDTH/2, CONFIG.GAME.BALL_RADIUS)) < 
            (radius + CONFIG.GAME.BALL_RADIUS * 2)) {
            return false
        }

        return true
    }

    shootBall(position) {
        this.ball.shootable = false
        this.ball.speed.x = (position.x - CONFIG.CANVAS.WIDTH/2) / CONFIG.GAME.SHOOT_SPEED_DIVISOR
        this.ball.speed.y = (position.y - 20) / CONFIG.GAME.SHOOT_SPEED_DIVISOR
        this.engine.ui.tries.innerText = `Tries: ${++this.tries}`
    }

    checkCompletion() {
        if (this.obstacles.every(obstacle => obstacle.number <= 0)) {
            this.engine.isGameOver = true
            this.ball.shootable = false
            this.engine.ui.doneText.className = 'doneText visible'
            this.engine.clearCanvas()
        }
    }
}

// Initialize game
const gameEngine = new GameEngine()
gameEngine.startGame()