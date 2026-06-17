class Main {
    constructor() {
        this.gravity = 0.1;
        this.x = 0;
        this.y = 0;

        this.canvas = document.getElementById('bgCanvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.frame = new Frame(this.canvas);
        window.addEventListener("mousemove", (e) => {
      this.x = e.clientX +window.scrollX
            this.y = e.clientY + window.scrollY;
        });

        // also for mobile
        window.addEventListener("touchmove", (e) => {
            this.x = e.touches[0].clientX + window.scrollX;
            this.y = e.touches[0].clientY + window.scrollY;
        });
        window.addEventListener("resize", (e) => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });
        requestAnimationFrame(this.update.bind(this));
    }

    update() {
        let ctx = this.canvas.getContext("2d");
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.frame.update(this.x, this.y, this.canvas, this.gravity);
        requestAnimationFrame(this.update.bind(this));
    }
}

window.onload = () => {
    new Main();
};
