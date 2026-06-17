class Frame {
    constructor(canvas, linkTargets = []) {
        this.cursor = new Cursor(canvas, linkTargets);
        this.outsideBits = [];
    }

    addOutsideBit(bit) {
        this.outsideBits.push(bit);
    }

    update(x, y, canvas, gravity) {
        this.cursor.update(new Vector(x, y), canvas, this);
        if (this.outsideBits) {
            this.outsideBits.forEach((b, i) => {
                if (!b.isLink && (b.position.x > canvas.width || b.position.x < 0 || b.position.y > canvas.height)) {
                    this.removeBit(i);
                    return;
                }
                b.move(gravity, canvas);

                for (let j = i + 1; j < this.outsideBits.length; j++) {
                    const otherBit = this.outsideBits[j];
                    if (b.isLink && otherBit.isLink) {
                        this.bounceLinks(b, otherBit);
                        continue;
                    }

                    if (b.isLink || otherBit.isLink) {
                        continue;
                    }

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

    getLinkAt(x, y) {
        for (let i = this.outsideBits.length - 1; i >= 0; i--) {
            const bit = this.outsideBits[i];
            if (bit.containsPoint(x, y)) {
                return bit.linkTarget;
            }
        }

        return null;
    }

    checkDistance(bitA, bitB) {
        return Math.sqrt(Math.pow(bitA.position.x - bitB.position.x, 2) + Math.pow(bitA.position.y - bitB.position.y, 2));
    }

    bounceLinks(bitA, bitB) {
        bitA.updateBounds();
        bitB.updateBounds();

        if (!this.rectanglesOverlap(bitA.bounds, bitB.bounds)) {
            return;
        }

        const separationPadding = 8;
        const overlapX = Math.min(bitA.bounds.x + bitA.bounds.width, bitB.bounds.x + bitB.bounds.width)
            - Math.max(bitA.bounds.x, bitB.bounds.x);
        const overlapY = Math.min(bitA.bounds.y + bitA.bounds.height, bitB.bounds.y + bitB.bounds.height)
            - Math.max(bitA.bounds.y, bitB.bounds.y);

        if (overlapX < overlapY) {
            const direction = bitA.position.x < bitB.position.x ? -1 : 1;
            const bitASpeed = Math.max(Math.abs(bitA.velocity.x), 0.45);
            const bitBSpeed = Math.max(Math.abs(bitB.velocity.x), 0.45);

            bitA.position.x += direction * (overlapX / 2 + separationPadding);
            bitB.position.x -= direction * (overlapX / 2 + separationPadding);
            bitA.velocity.x = direction * bitBSpeed;
            bitB.velocity.x = -direction * bitASpeed;
        } else {
            const direction = bitA.position.y < bitB.position.y ? -1 : 1;
            const bitASpeed = Math.max(Math.abs(bitA.velocity.y), 0.45);
            const bitBSpeed = Math.max(Math.abs(bitB.velocity.y), 0.45);

            bitA.position.y += direction * (overlapY / 2 + separationPadding);
            bitB.position.y -= direction * (overlapY / 2 + separationPadding);
            bitA.velocity.y = direction * bitBSpeed;
            bitB.velocity.y = -direction * bitASpeed;
        }

        bitA.limitSpeed(1);
        bitB.limitSpeed(1);
        bitA.updateBounds();
        bitB.updateBounds();
    }

    rectanglesOverlap(rectA, rectB) {
        return rectA.x < rectB.x + rectB.width
            && rectA.x + rectA.width > rectB.x
            && rectA.y < rectB.y + rectB.height
            && rectA.y + rectA.height > rectB.y;
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
