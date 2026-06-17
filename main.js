class Main {
    constructor() {
        this.gravity = 0.1;
        this.x = 0;
        this.y = 0;

        this.canvas = document.getElementById('bgCanvas');
        this.resizeCanvas();

        this.frame = new Frame(this.canvas, this.getPageLinks());
        this.canvas.addEventListener("mousemove", (e) => {
            const point = this.getCanvasPoint(e);
            this.x = point.x;
            this.y = point.y;
            this.updateHover(point);
        });
        // also for mobile
        this.canvas.addEventListener("touchmove", (e) => {
            const point = this.getCanvasPoint(e.touches[0]);
            this.x = point.x;
            this.y = point.y;
        });
        this.canvas.addEventListener("click", (e) => {
            const point = this.getCanvasPoint(e);
            const linkTarget = this.frame.getLinkAt(point.x, point.y);

            if (linkTarget) {
                window.location.href = linkTarget.href;
            }
        });
        window.addEventListener("resize", (e) => {
            this.resizeCanvas();
        });
        requestAnimationFrame(this.update.bind(this));
    }

    update() {
        let ctx = this.canvas.getContext("2d");
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.frame.update(this.x, this.y, this.canvas, this.gravity);
        requestAnimationFrame(this.update.bind(this));
    }

    getCanvasPoint(eventPoint) {
        const rect = this.canvas.getBoundingClientRect();
        return new Vector(eventPoint.clientX - rect.left, eventPoint.clientY - rect.top);
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    updateHover(point) {
        document.body.classList.toggle("link-hover", Boolean(this.frame.getLinkAt(point.x, point.y)));
    }

    getPageLinks() {
        return Array.from(document.querySelectorAll(".site-links a")).map((link) => ({
            label: link.textContent,
            href: link.getAttribute("href"),
        }));
    }
}

window.onload = () => {
    new Main();
};
