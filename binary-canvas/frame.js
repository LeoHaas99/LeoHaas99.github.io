class Frame {
    constructor(canvas) {
        this.cursor = new Cursor(canvas);
        this.outsideBits = [];
    }

    addOutsideBit(bit) {
        this.outsideBits.push(bit);
    }

    update(x, y, canvas, gravity) {
        this.cursor.update(new Vector(x, y), canvas, this);
        if (this.outsideBits) {
            this.outsideBits.forEach((b, i) => {
                if (b.position.x > canvas.width || b.position.x < 0 || b.position.y > canvas.height) {
                    this.removeBit(i);
                }
                b.move(gravity);

                for (let j = i + 1; j < this.outsideBits.length; j++) {
                    const otherBit = this.outsideBits[j];
                    const distance = this.checkDistance(b, otherBit);
                    const radiusSum = 15;

                    if (distance <= radiusSum) {
                        b.num = (parseInt(b.num, 2) + parseInt(otherBit.num, 2)).toString(2);
                        this.removeBit(j);
                    } else {
                        this.applyMagneticForce(b, otherBit, distance);
                    }
                }
            });
        }
    }

    checkDistance(bitA, bitB) {
        return Math.sqrt(Math.pow(bitA.position.x - bitB.position.x, 2) + Math.pow(bitA.position.y - bitB.position.y, 2));
    }

    applyMagneticForce(bitA, bitB, distance) {
        const magnetRange = 100;
        if (distance <= magnetRange) {
            const force = (magnetRange - distance) / magnetRange;
            const direction = new Vector(bitB.position.x - bitA.position.x, bitB.position.y - bitA.position.y);
            direction.length = force;

            bitA.position.x += direction.x;
            bitA.position.y += direction.y;

            bitB.position.x -= direction.x;
            bitB.position.y -= direction.y;
        }
    }

    removeBit(index) {
        let last = this.outsideBits[this.outsideBits.length - 1];
        let removing = this.outsideBits[index];
        this.outsideBits[this.outsideBits.length - 1] = removing;
        this.outsideBits[index] = last;
        this.outsideBits.pop();
    }
}
