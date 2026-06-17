class Movement {
    constructor() {
        this.positions = [];
        for (let i = 0; i < 3; i++) this.positions.push(new Vector());
    }

    addPosition(position) {
        this.positions.shift();
        this.positions.push(position);
    }

    getPreviousVelocity() {
        return new Vector(this.positions[1].x - this.positions[0].x, this.positions[1].y - this.positions[0].y);
    }

    getVelocity() {
        return new Vector(this.positions[2].x - this.positions[1].x, this.positions[2].y - this.positions[1].y);
    }

    getAcceleration() {
        return new Vector(this.getVelocity().x - this.getPreviousVelocity().x, this.getVelocity().y - this.getPreviousVelocity().y);
    }
}
