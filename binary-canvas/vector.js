class Vector {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    get length() {
        let x = this.x;
        let y = this.y;

        return Math.sqrt(x * x + y * y);
    }

    get angle() {
        let x = this.x;
        let y = this.y;

        return Math.atan2(y, x);
    }

    set length(length) {
        let angle = this.angle;

        this.x = length * Math.cos(angle);
        this.y = length * Math.sin(angle);
    }

    set angle(angle) {
        let length = this.length;

        this.x = length * Math.cos(angle);
        this.y = length * Math.sin(angle);
    }

    add(otherVector) {
        this.x += otherVector.x;
        this.y += otherVector.y;
    }
}
