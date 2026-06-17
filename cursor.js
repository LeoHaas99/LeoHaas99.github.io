class Cursor {
    constructor(canvas, linkTargets = []) {
        this.movement = new Movement();
        this.maxForce = 200;
        this.linkTargets = linkTargets;
        this.nextLinkIndex = 0;
        this.bitsUntilNextLink = 3;
        this.bit = this.createBit(canvas);
    }

    update(position, canvas, frame) {
        this.movement.addPosition(position);
        if (this.bit.mass * this.movement.getAcceleration().length > this.maxForce) {
            const speed = this.movement.getVelocity().length;
            const numLength = Math.floor(speed / 30) + 1;
            const releasedBit = this.bit;

            releasedBit.position = new Vector(this.movement.positions[1].x, this.movement.positions[1].y);
            releasedBit.velocity = this.getReleaseVelocity(releasedBit);
            releasedBit.position.add(releasedBit.velocity);
            frame.addOutsideBit(releasedBit);
            this.bit = this.createBit(canvas, numLength);
        }
    }

    createBit(canvas, numLength = 1) {
        if (this.shouldCreateLink()) {
            const linkTarget = this.linkTargets[this.nextLinkIndex];
            this.nextLinkIndex++;
            return new Bit(canvas, 1, linkTarget);
        }

        return new Bit(canvas, numLength);
    }

    shouldCreateLink() {
        if (this.nextLinkIndex >= this.linkTargets.length) {
            return false;
        }

        this.bitsUntilNextLink--;
        if (this.bitsUntilNextLink > 0) {
            return false;
        }

        this.bitsUntilNextLink = 4 + Math.floor(Math.random() * 4);
        return true;
    }

    getReleaseVelocity(bit) {
        const velocity = this.movement.getPreviousVelocity();

        if (bit.isLink) {
            velocity.length = Math.min(Math.max(velocity.length * 0.02, 0.15), 0.45);
            return velocity;
        }

        let acc = this.movement.getAcceleration();
        acc.length -= this.maxForce / bit.mass;
        velocity.add(acc);
        return velocity;
    }
}
