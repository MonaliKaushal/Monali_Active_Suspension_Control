import { Chart, registerables } from 'chart.js';
import { createIcons, Activity, Settings, Zap, LineChart, Cpu } from 'lucide';

Chart.register(...registerables);

// Initialize Icons
createIcons({
    icons: {
        Activity,
        Settings,
        Zap,
        LineChart,
        Cpu
    }
});

// DOM Elements
const kpSlider = document.getElementById('kp-slider');
const kdSlider = document.getElementById('kd-slider');
const kiSlider = document.getElementById('ki-slider');
const kpVal = document.getElementById('kp-val');
const kdVal = document.getElementById('kd-val');
const kiVal = document.getElementById('ki-val');
const distBtns = document.querySelectorAll('.dist-btn');
const ctx = document.getElementById('responseChart').getContext('2d');

const vBody = document.getElementById('v-body');
const vWheel = document.getElementById('v-wheel');
const vBump = document.getElementById('v-bump');

const metricSettling = document.getElementById('metric-settling');
const metricOvershoot = document.getElementById('metric-overshoot');
const metricDamping = document.getElementById('metric-damping');

// Simulation State
let kp = 30.0;
let kd = 5.0;
let ki = 0.0;
let distType = 'step';

// Simulation Constants
const dt = 0.01;
const duration = 10;
const steps = duration / dt;

let chart;

function initChart() {
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Road Profile (Input)',
                    data: [],
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0
                },
                {
                    label: 'Car Body Displacement (Output)',
                    data: [],
                    borderColor: '#00f2ff',
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: {
                        target: 'origin',
                        above: 'rgba(0, 242, 255, 0.05)',
                    },
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 400
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Time (seconds)', color: '#a0a0a0' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a0a0a0' }
                },
                y: {
                    title: { display: true, text: 'Displacement (meters)', color: '#a0a0a0' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a0a0a0' },
                    min: -0.5,
                    max: 1.5
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#ffffff', usePointStyle: true }
                },
                tooltip: {
                    backgroundColor: 'rgba(20, 20, 20, 0.9)',
                    titleColor: '#00f2ff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1
                }
            }
        }
    });
}

function simulate() {
    let x1 = 0; // Displacement
    let x2 = 0; // Velocity
    let integral = 0;
    let prevError = 0;

    const times = [];
    const roadData = [];
    const bodyData = [];

    let maxOvershoot = 0;
    let settlingTime = -1;
    const finalValue = (distType === 'step' || distType === 'pulse' && duration < 2) ? 1 : 0; // Roughly

    for (let i = 0; i < steps; i++) {
        const t = i * dt;
        times.push(t);

        // Road Input
        let road = 0;
        if (distType === 'step') {
            road = t >= 1 ? 1 : 0;
        } else if (distType === 'pulse') {
            road = (t >= 1 && t <= 2) ? 1 : 0;
        } else if (distType === 'sine') {
            road = t >= 1 ? 0.3 * Math.sin(2 * Math.PI * 0.5 * (t - 1)) : 0;
        } else if (distType === 'impulse') {
            road = (t >= 1 && t < 1.05) ? 1 : 0;
        }

        roadData.push(road);

        // Control Logic
        // error = Road (desired displacement relative to wheels) - Body Displacement
        // Note: In active suspension, we usually want body to stay flat (y=0) 
        // while wheels follow road (r).
        // But the prompt says "return the car to its original height".
        // Let's assume the goal is y = road (to simplify tracking) or y = 0.
        // Actually, for a car bump, if road goes up by 1m, 
        // the body initially wants to stay at 0.
        
        const error = road - x1;
        integral += error * dt;
        const derivative = (error - prevError) / dt;
        
        const u = kp * error + kd * derivative + ki * integral;
        prevError = error;

        // System Dynamics: x'' + 3x' + 2x = u
        // x2' = u - 3*x2 - 2*x1
        const dx1 = x2;
        const dx2 = u - 3 * x2 - 2 * x1;

        x1 += dx1 * dt;
        x2 += dx2 * dt;

        bodyData.push(x1);

        // Metrics
        if (Math.abs(x1) > maxOvershoot) maxOvershoot = Math.abs(x1);
        
        // Settling time calculation (2% of step size)
        // Only valid for step input
        if (distType === 'step') {
            if (Math.abs(x1 - 1) > 0.02) {
                settlingTime = t;
            }
        } else {
            if (Math.abs(x1) > 0.02) {
                settlingTime = t;
            }
        }
    }

    // Update Chart
    chart.data.labels = times;
    chart.data.datasets[0].data = roadData;
    chart.data.datasets[1].data = bodyData;
    chart.update();

    // Update Metrics
    metricSettling.innerText = settlingTime > 9 ? ">10s" : settlingTime.toFixed(2) + "s";
    metricOvershoot.innerText = maxOvershoot.toFixed(3) + "m";
    
    // Estimate Damping Ratio from Kp, Kd
    // Characteristic eq: s^2 + (3+Kd)s + (2+Kp) = 0
    // 2*zeta*wn = 3 + Kd
    // wn^2 = 2 + Kp
    const wn = Math.sqrt(2 + kp);
    const zeta = (3 + kd) / (2 * wn);
    metricDamping.innerText = zeta.toFixed(3);
    
    if (zeta > 0.6 && zeta < 0.8) {
        metricDamping.style.color = '#00ff64';
    } else {
        metricDamping.style.color = 'var(--primary)';
    }

    // Update Animation
    updateAnimation(roadData[roadData.length-1], bodyData[bodyData.length-1]);
}

let lastRoad = 0;
let lastBody = 0;

function updateAnimation(road, body) {
    // This is just a static frame update based on last point, 
    // but we can animate the whole sequence if we want.
    // For now, let's just make it reactive to the current time if we were running real-time.
    // Since it's a batch simulation, let's just animate a few frames.
}

// Event Listeners
kpSlider.addEventListener('input', (e) => {
    kp = parseFloat(e.target.value);
    kpVal.innerText = kp.toFixed(1);
    simulate();
});

kdSlider.addEventListener('input', (e) => {
    kd = parseFloat(e.target.value);
    kdVal.innerText = kd.toFixed(1);
    simulate();
});

kiSlider.addEventListener('input', (e) => {
    ki = parseFloat(e.target.value);
    kiVal.innerText = ki.toFixed(1);
    simulate();
});

distBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        distBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        distType = btn.dataset.type;
        simulate();
    });
});

const presetBtns = document.querySelectorAll('.preset-btn');

presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        kp = parseFloat(btn.dataset.kp);
        kd = parseFloat(btn.dataset.kd);
        ki = 0;
        
        kpSlider.value = kp;
        kdSlider.value = kd;
        kiSlider.value = ki;
        
        kpVal.innerText = kp.toFixed(1);
        kdVal.innerText = kd.toFixed(1);
        kiVal.innerText = ki.toFixed(1);
        
        simulate();
    });
});

// Initial Run
initChart();
simulate();

// Visual Animation Loop (Optional for extra "wow")
let animFrame = 0;
function animate() {
    animFrame = (animFrame + 1) % steps;
    const t = animFrame * dt;
    
    let road = 0;
    if (distType === 'step') road = t >= 1 ? 1 : 0;
    else if (distType === 'pulse') road = (t >= 1 && t <= 2) ? 1 : 0;
    else if (distType === 'sine') road = t >= 1 ? 0.3 * Math.sin(2 * Math.PI * 0.5 * (t - 1)) : 0;
    else if (distType === 'impulse') road = (t >= 1 && t < 1.05) ? 1 : 0;

    // Use simulated data for body
    const body = chart.data.datasets[1].data[animFrame];

    // Scale for visual: 0.1m = 10px
    const roadY = road * 40;
    const bodyY = body * 40;

    vBump.style.height = (roadY > 0 ? roadY : 0) + 'px';
    vBump.style.display = roadY > 0 ? 'block' : 'none';
    vWheel.style.bottom = (10 + roadY) + 'px';
    vBody.style.bottom = (60 + bodyY) + 'px';

    requestAnimationFrame(animate);
}
animate();
