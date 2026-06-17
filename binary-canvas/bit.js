class Bit {
    constructor(canvas, numLength = 1) {
        this.num = this.generateRandomBinary(numLength);
        this.position = new Vector();
        this.velocity = new Vector();
        this.mass = Math.floor(Math.random() * 80 + 20);
        this.ctx = canvas.getContext("2d");
    }

    generateRandomBinary(length) {
        return Math.round(Math.random()).toString();
    }

    draw() {
        this.ctx.fillStyle = "gray";
        this.ctx.beginPath();
        this.ctx.font = 30 + "px Courier New";
        this.ctx.fillText(this.num, this.position.x, this.position.y);
    }

    move(gravity) {
        this.position.add(this.velocity);
        this.velocity.y += gravity;
        this.draw();
    }
}
