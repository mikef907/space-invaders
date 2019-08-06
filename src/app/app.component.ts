import {
  Component,
  ViewChild,
  OnInit,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { fromEvent, of, merge, Observable, Subject, BehaviorSubject } from 'rxjs';
import { tap, throttleTime } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('canvas', { static: true })
  canvas: ElementRef;

  ctx: CanvasRenderingContext2D;
  ship: Ship;
  keys: { [key: number]: boolean } = {};
  bullets: Bullet[] = [];
  enemies: Enemy[] = [];
  particles: ParticalCluster[] = [];
  lives = 3;
  score = 0;
  round = 0;
  $stopped: BehaviorSubject<boolean> = new BehaviorSubject(true);
  $stoppedObs = this.$stopped.asObservable();
  $fire: Observable<KeyboardEvent>;
  $keyDown: Observable<KeyboardEvent>;
  $keyUp: Observable<KeyboardEvent>;

  ngOnInit(): void {
    // get the context
    const canvasEl: HTMLCanvasElement = this.canvas.nativeElement;
    this.ctx = canvasEl.getContext('2d');
    this.ctx.canvas.width = 500;
    this.ctx.canvas.height = 500;
    this.ship = new Ship(this.ctx, this.ctx.canvas.width / 2);

    this.$keyDown = fromEvent<KeyboardEvent>(document, 'keydown').pipe(tap(event => {
      this.keys[event.which] = true;
    }));

    this.$keyUp = fromEvent<KeyboardEvent>(document, 'keyup').pipe(tap(event => {
      this.keys[event.which] = false;
    }));

    this.$fire = fromEvent<KeyboardEvent>(document, 'keypress').pipe(throttleTime(100), tap(event => {
      if (event.which === 32) {
        this.bullets.push(this.ship.fire());
      }
    }));

    this.$stoppedObs = this.$stoppedObs.pipe(tap(value => {
      console.log('Value', value);
      if (!value) {
        this.gameLoop();
      }
    }));
  }

  setUpGame() {
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.ship = new Ship(this.ctx, this.ctx.canvas.width / 2);
    this.round = 0;
    this.score = 0;
    this.lives = 3;
    this.$stopped.next(false);
  }

  ngAfterViewInit() {
    merge(this.$keyDown, this.$keyUp, this.$fire, this.$stoppedObs, of(this.gameLoop())).subscribe();
  }

  spawnSquadOfEnemies(count: number) {
    for (let i = 0; i <= count; i++) {
      this.spawnRowOfEnemies(20 * i);
    }
  }

  spawnRowOfEnemies(yOffSet: number) {
    for (let i = 0; i < this.ctx.canvas.height / 20; i++) {
      if (Math.random() < 0.01) {
        this.enemies.push(new Enemy(this.ctx, i * 10 + (i * 10), 10 + yOffSet, 10, 10, 'green', 500));
      } else {
        this.enemies.push(new Enemy(this.ctx, i * 10 + (i * 10), 10 + yOffSet, 10, 10, 'blue', 100));
      }
    }
  }

  gameLoop = () => {
    if (this.$stopped.value) {
      return;
    } else if (this.lives <= 0) {
      return;
    }

    requestAnimationFrame(this.gameLoop);
    // Clear the canvas to be redrawn
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

    if (this.keys[37] && this.ship.X >= 0) {
      this.ship.X -= 2;
    }
    if (this.keys[39] && this.ship.X <= this.ctx.canvas.width) {
      this.ship.X += 2;
    }

    this.bullets.forEach((b, i) => {
      b.draw();

      if (!b.IsEnemyFire) {
        const result = b.hitEnemy(this.enemies);
        if (result) {
          this.enemies.splice(this.enemies.indexOf(result), 1);
          this.bullets.splice(i, 1);
          this.particles.push(new ParticalCluster(this.ctx, 5, result.X, result.Y));
          this.score += result.Points;
        }
      } else if (this.ship && this.ship.InvulnerableTicks === 0 && this.ship.checkForRectCollision(b.X, b.Y, b.W, b.H)) {
        this.lives--;
        this.particles.push(new ParticalCluster(this.ctx, 10, this.ship.X, this.ship.Y));
        this.ship = new Ship(this.ctx, this.ctx.canvas.width / 2);
      }

      if (b.lifespan <= 0) {
        this.bullets.splice(i, 1);
      }
    });
    this.particles.forEach((e, i) => {
      e.draw();
      if (e.Lifespan <= 0) {
        this.particles.splice(i, 1);
      }
    });
    this.ship.draw();
    if (this.ship.InvulnerableTicks > 0) {
      this.ship.decrementInvulnerable();
    }
    this.enemies.forEach((e, i) => {
      e.draw();
      if (this.ship.InvulnerableTicks === 0 && this.ship.checkForRectCollision(e.X, e.Y, e.Width, e.Height)) {
        this.lives--;
        this.particles.push(new ParticalCluster(this.ctx, 10, this.ship.X, this.ship.Y));
        this.ship = new Ship(this.ctx, this.ctx.canvas.width / 2);
      } else if (e.Y >= this.ctx.canvas.height) {
        this.enemies.splice(i, 1);
      } else if (e.checkLoS(this.enemies) && Math.random() < (this.round / 1000)) {
        this.bullets.push(e.fire());
      }
    });
    if (this.enemies.length <= 0) {
      this.spawnSquadOfEnemies(this.round++);
    }
  }
}

export class Ship {
  // position
  private y: number;
  private lv: { x: number, y: number };
  private rv: { x: number, y: number };
  private tv: { x: number, y: number };
  private invulnerableTicks = 250;

  get leftVertex() { return this.lv; }
  get topVertex() { return this.tv; }
  get rightVertex() { return this.rv; }

  get InvulnerableTicks() { return this.invulnerableTicks; }

  decrementInvulnerable() {
    this.invulnerableTicks--;
  }

  get X() {
    return this.x;
  }
  set X(value: number) {
    this.x = value;
  }
  get Y() {
    return this.y;
  }

  constructor(private ctx: CanvasRenderingContext2D, private x: number) {
    this.y = ctx.canvas.height - 100;
  }

  draw() {
    this.tv = { x: this.x, y: this.y };
    this.lv = { x: this.x - 25, y: this.y + 25 };
    this.rv = { x: this.x + 25, y: this.y + 25 };
    if (this.invulnerableTicks > 0 && this.invulnerableTicks % 5 !== 1) {
      return;
    }
    this.ctx.beginPath();
    this.ctx.moveTo(this.tv.x, this.tv.y);
    this.ctx.lineTo(this.lv.x, this.lv.y);
    this.ctx.lineTo(this.rv.x, this.rv.y);
    this.ctx.fillStyle = 'red';
    this.ctx.fill();
  }

  fire() {
    return new Bullet(this.ctx, this.x - 2.5, this.y - 2.5, -2, false);
  }

  checkForRectCollision(x, y, w, h) {
    const p1 = { x, y };
    const p2 = { x: x + w, y };
    const p3 = { x, y: y + h };
    const p4 = { x: x + w, y: y + h };
    if (
      // Left v to top v
      intersects(this.leftVertex.x, this.leftVertex.y, this.topVertex.x, this.topVertex.y, p1.x, p1.y, p2.x, p2.y) ||
      intersects(this.leftVertex.x, this.leftVertex.y, this.topVertex.x, this.topVertex.y, p1.x, p1.y, p3.x, p3.y) ||
      intersects(this.leftVertex.x, this.leftVertex.y, this.topVertex.x, this.topVertex.y, p2.x, p2.y, p4.x, p4.y) ||
      intersects(this.leftVertex.x, this.leftVertex.y, this.topVertex.x, this.topVertex.y, p3.x, p3.y, p4.x, p4.y) ||
      // Right v to top v
      intersects(this.rightVertex.x, this.rightVertex.y, this.topVertex.x, this.topVertex.y, p1.x, p1.y, p2.x, p2.y) ||
      intersects(this.rightVertex.x, this.rightVertex.y, this.topVertex.x, this.topVertex.y, p1.x, p1.y, p3.x, p3.y) ||
      intersects(this.rightVertex.x, this.rightVertex.y, this.topVertex.x, this.topVertex.y, p2.x, p2.y, p4.x, p4.y) ||
      intersects(this.rightVertex.x, this.rightVertex.y, this.topVertex.x, this.topVertex.y, p3.x, p3.y, p4.x, p4.y) ||
      // Left v to right v
      intersects(this.leftVertex.x, this.leftVertex.y, this.rightVertex.x, this.rightVertex.y, p1.x, p1.y, p2.x, p2.y) ||
      intersects(this.leftVertex.x, this.leftVertex.y, this.rightVertex.x, this.rightVertex.y, p1.x, p1.y, p3.x, p3.y) ||
      intersects(this.leftVertex.x, this.leftVertex.y, this.rightVertex.x, this.rightVertex.y, p2.x, p2.y, p4.x, p4.y) ||
      intersects(this.leftVertex.x, this.leftVertex.y, this.rightVertex.x, this.rightVertex.y, p3.x, p3.y, p4.x, p4.y)) {
      return true;
    } else {
      return false;
    }
  }
}

export class Enemy {
  private tic: number;
  private toc: boolean;

  get X() { return this.x; }

  get Y() { return this.y; }

  get Height() { return this.h; }

  get Width() { return this.w; }

  get Points() { return this.points; }

  constructor(
    private ctx: CanvasRenderingContext2D,
    private x: number,
    private y: number,
    private h: number,
    private w: number,
    private c: string,
    private points: number) {
    this.tic = 50;
    this.toc = true;
  }

  updatePosition() {
    if (this.tic-- === 0) {
      this.tic = 50;
      this.x += this.toc ? this.w : this.w * -1;
      this.toc = !this.toc;
      this.y += this.h;
    }
  }

  draw() {
    this.updatePosition();
    this.ctx.fillStyle = this.c;
    this.ctx.fillRect(this.x, this.y, this.w, this.h);
  }

  fire() {
    return new Bullet(this.ctx, this.x + 10, this.y + 15, 2, true);
  }

  checkLoS(enemies: Enemy[]) {
    return !enemies.some(e => e.X === this.X && e.Y > this.Y);
  }

  // checkForPlayerCollision(ship: Ship) {
  //   const p1 = { x: this.x, y: this.y };
  //   const p2 = { x: this.x + this.w, y: this.y };
  //   const p3 = { x: this.x, y: this.y + this.h };
  //   const p4 = { x: this.x + this.w, y: this.y + this.h };
  //   if (
  //     // Left v to top v
  //     intersects(ship.leftVertex.x, ship.leftVertex.y, ship.topVertex.x, ship.topVertex.y, p1.x, p1.y, p2.x, p2.y) ||
  //     intersects(ship.leftVertex.x, ship.leftVertex.y, ship.topVertex.x, ship.topVertex.y, p1.x, p1.y, p3.x, p3.y) ||
  //     intersects(ship.leftVertex.x, ship.leftVertex.y, ship.topVertex.x, ship.topVertex.y, p2.x, p2.y, p4.x, p4.y) ||
  //     intersects(ship.leftVertex.x, ship.leftVertex.y, ship.topVertex.x, ship.topVertex.y, p3.x, p3.y, p4.x, p4.y) ||
  //     // Right v to top v
  //     intersects(ship.rightVertex.x, ship.rightVertex.y, ship.topVertex.x, ship.topVertex.y, p1.x, p1.y, p2.x, p2.y) ||
  //     intersects(ship.rightVertex.x, ship.rightVertex.y, ship.topVertex.x, ship.topVertex.y, p1.x, p1.y, p3.x, p3.y) ||
  //     intersects(ship.rightVertex.x, ship.rightVertex.y, ship.topVertex.x, ship.topVertex.y, p2.x, p2.y, p4.x, p4.y) ||
  //     intersects(ship.rightVertex.x, ship.rightVertex.y, ship.topVertex.x, ship.topVertex.y, p3.x, p3.y, p4.x, p4.y) ||
  //     // Left v to right v
  //     intersects(ship.leftVertex.x, ship.leftVertex.y, ship.rightVertex.x, ship.rightVertex.y, p1.x, p1.y, p2.x, p2.y) ||
  //     intersects(ship.leftVertex.x, ship.leftVertex.y, ship.rightVertex.x, ship.rightVertex.y, p1.x, p1.y, p3.x, p3.y) ||
  //     intersects(ship.leftVertex.x, ship.leftVertex.y, ship.rightVertex.x, ship.rightVertex.y, p2.x, p2.y, p4.x, p4.y) ||
  //     intersects(ship.leftVertex.x, ship.leftVertex.y, ship.rightVertex.x, ship.rightVertex.y, p3.x, p3.y, p4.x, p4.y)) {
  //     return true;
  //   } else {
  //     return false;
  //   }
  // }
}

export class ParticalCluster {
  private lifespan = 15;

  get Lifespan() { return this.lifespan; }

  constructor(private ctx: CanvasRenderingContext2D, private count: number, private x: number, private y: number) { }

  draw() {
    for (let i = 0; i < this.count; i++) {
      this.ctx.fillStyle = '#' + (0x1000000 + (Math.random()) * 0xffffff).toString(16).substr(1, 6);
      this.ctx.fillRect(this.x + Math.random() * 20, this.y + Math.random() * 20, 2, 2);
    }
    this.lifespan--;
  }
}


export class Bullet {
  private w = 5;
  public lifespan;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private x: number,
    private y: number,
    private vy: number,
    private isEnemyFire: boolean
  ) {
    this.lifespan = ctx.canvas.height;
  }

  get IsEnemyFire() { return this.isEnemyFire; }

  get X() { return this.x; }

  get Y() { return this.y; }

  get W() { return this.w; }

  get H() { return this.w; }

  draw() {
    this.updatePosition();
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(this.x, this.y, this.w, this.w);
  }

  hitEnemy(enemies: Enemy[]) {
    return enemies.find(
      e => this.x < e.X + e.Width
        && this.x + this.w > e.X
        && this.y < e.Y + e.Height
        && this.y + this.w > e.Y);
  }

  updatePosition() {
    this.y += this.vy;
    this.lifespan--;
  }
}

// Adapted from: http://stackoverflow.com/questions/563198/how-do-you-detect-where-two-line-segments-intersect/1968345#1968345
export function intersects(p0_x, p0_y, p1_x, p1_y, p2_x, p2_y, p3_x, p3_y) {

  var s1_x, s1_y, s2_x, s2_y;
  s1_x = p1_x - p0_x;
  s1_y = p1_y - p0_y;
  s2_x = p3_x - p2_x;
  s2_y = p3_y - p2_y;

  var s, t;
  s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
  t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);

  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    // Collision detected
    return 1;
  }

  return 0; // No collision
}