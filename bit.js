class Bit {
    constructor(canvas, numLength = 1, linkTarget = null) {
        this.linkTarget = linkTarget;
        this.isLink = Boolean(linkTarget);
        this.num = this.generateRandomBinary(numLength);
        this.position = new Vector();
        this.velocity = new Vector();
        this.mass = Math.floor(Math.random() * 80 + 20);
        this.ctx = canvas.getContext("2d");
        this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    }

    generateRandomBinary(length) {
        let binary = "";
        for (let i = 0; i < Math.max(1, length); i++) {
            binary += Math.round(Math.random()).toString();
        }
        return binary;
    }

    draw() {
        const { text, metrics } = this.updateBounds();

        this.ctx.beginPath();
        if (this.isLink) {
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
            this.ctx.fillRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);

            this.ctx.fillStyle = "#005fcc";
            this.ctx.fillText(text, this.position.x, this.position.y);
            this.ctx.strokeStyle = "#005fcc";
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(this.position.x, this.position.y + 3);
            this.ctx.lineTo(this.position.x + metrics.width, this.position.y + 3);
            this.ctx.stroke();
        } else {
            this.ctx.fillStyle = "gray";
            this.ctx.fillText(text, this.position.x, this.position.y);
        }
    }

    move(gravity, canvas) {
        if (this.isLink) {
            this.velocity.y += gravity * 0.02;
            this.limitSpeed(0.45);
            this.position.add(this.velocity);
            this.bounceOffBorders(canvas);
            this.draw();
            return;
        }

        this.position.add(this.velocity);
        this.velocity.y += gravity;
        this.draw();
    }

    containsPoint(x, y) {
        return this.isLink
            && x >= this.bounds.x
            && x <= this.bounds.x + this.bounds.width
            && y >= this.bounds.y
            && y <= this.bounds.y + this.bounds.height;
    }

    limitSpeed(maxSpeed) {
        if (this.velocity.length > maxSpeed) {
            this.velocity.length = maxSpeed;
        }
    }

    updateBounds() {
        const text = this.isLink ? this.linkTarget.label : this.num;
        const fontSize = this.isLink ? 22 : 30;
        const paddingX = this.isLink ? 8 : 0;
        const paddingY = this.isLink ? 5 : 0;

        this.ctx.font = `${fontSize}px Courier New`;
        const metrics = this.ctx.measureText(text);
        this.bounds = {
            x: this.position.x - paddingX,
            y: this.position.y - fontSize - paddingY,
            width: metrics.width + paddingX * 2,
            height: fontSize + paddingY * 2,
        };

        return { text, metrics };
    }

    bounceOffBorders(canvas) {
        if (!canvas) {
            return;
        }

        this.updateBounds();
        if (this.bounds.x < 0) {
            this.position.x -= this.bounds.x;
            this.velocity.x = Math.abs(this.velocity.x);
        } else if (this.bounds.x + this.bounds.width > canvas.width) {
            this.position.x -= this.bounds.x + this.bounds.width - canvas.width;
            this.velocity.x = -Math.abs(this.velocity.x);
        }

        if (this.bounds.y < 0) {
            this.position.y -= this.bounds.y;
            this.velocity.y = Math.abs(this.velocity.y);
        } else if (this.bounds.y + this.bounds.height > canvas.height) {
            this.position.y -= this.bounds.y + this.bounds.height - canvas.height;
            this.velocity.y = -Math.abs(this.velocity.y);
        }
    }
}
