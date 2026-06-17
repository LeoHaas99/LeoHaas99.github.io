class Cursor {
    constructor(canvas) {
        this.movement = new Movement();
        this.maxForce = 200;
        this.bit = new Bit(canvas);
    }

    update(position, canvas, frame) {
        this.movement.addPosition(position);
        if (this.bit.mass * this.movement.getAcceleration().length > this.maxForce) {
            const speed = this.movement.getVelocity().length;
            const numLength = Math.floor(speed / 30) + 1; // Adjust this line
            this.bit.position = new Vector(this.movement.positions[1].x, this.movement.positions[1].y);
            this.bit.velocity = this.movement.getPreviousVelocity();
            let acc = this.movement.getAcceleration();
            acc.length -= this.maxForce / this.bit.mass;
            this.bit.velocity.add(acc);
            this.bit.position.add(this.bit.velocity);
            frame.addOutsideBit(this.bit);
            this.bit = new Bit(canvas, numLength);
        }
    }
}
