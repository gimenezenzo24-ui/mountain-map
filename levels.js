// levels.js - Datos de los 7 niveles de la montaña y configuración de mini-juegos
const LEVELS_DATA = [
    {
        id: 1,
        title: "Campamento Base",
        subtitle: "Falda de la Montaña",
        description: "El inicio de la expedición entre praderas verdes y árboles centenarios. Recoge 5 mochilas de suministros antes de emprender la ascensión.",
        zone: "valle",
        x: 150,
        y: 530,
        difficulty: 1,
        color: "#4ade80",
        borderColor: "#166534",
        neighbors: [2],
        game: {
            type: "collect",
            goal: 5,
            itemIcon: "🎒",
            itemName: "Suministros",
            timeLimit: 25,
            hazards: 2,
            hint: "Usa Flechas o WASD para moverte y recoger 5 mochilas."
        }
    },
    {
        id: 2,
        title: "Bosque de los Susurros",
        subtitle: "Laderas Bajas",
        description: "Un bosque místico envuelto en niebla. Encuentra 5 linternas élficas esquivando los remolinos de hojas cortantes.",
        zone: "bosque",
        x: 360,
        y: 470,
        difficulty: 1,
        color: "#22c55e",
        borderColor: "#14532d",
        neighbors: [1, 3],
        game: {
            type: "collect",
            goal: 5,
            itemIcon: "🏮",
            itemName: "Linternas",
            timeLimit: 22,
            hazards: 3,
            hint: "Recoge las 5 linternas mágicas esquivando los remolinos."
        }
    },
    {
        id: 3,
        title: "Cañón Rocoso",
        subtitle: "Pared Escarpada",
        description: "Un angosto desfiladero azotado por derrumbes. Llega a la cima del cañón esquivando las rocas que caen rodando.",
        zone: "roca",
        x: 230,
        y: 350,
        difficulty: 2,
        color: "#fb923c",
        borderColor: "#9a3412",
        neighbors: [2, 4],
        game: {
            type: "dodge_climb",
            goal: 6,
            itemIcon: "⛏️",
            itemName: "Picos de escalada",
            timeLimit: 22,
            hazards: 4,
            hint: "Esquiva los peñascos que ruedan y recoge 6 picos para fijar la cuerda."
        }
    },
    {
        id: 4,
        title: "Cueva de Cristal",
        subtitle: "Caverna Oculta",
        description: "Una gruta subterránea resplandeciente. Extrae 6 gemas preciosas que iluminarán los oscuros pasajes hacia la cumbre.",
        zone: "cueva",
        x: 480,
        y: 340,
        difficulty: 2,
        color: "#38bdf8",
        borderColor: "#0369a1",
        neighbors: [3, 5, 6],
        game: {
            type: "collect",
            goal: 6,
            itemIcon: "💎",
            itemName: "Cristales",
            timeLimit: 20,
            hazards: 4,
            hint: "Recolecta 6 cristales de luz brillante en la caverna."
        }
    },
    {
        id: 5,
        title: "Puente del Viento",
        subtitle: "Desfiladero Abisal",
        description: "Un frágil puente de cuerdas suspendido sobre el vacío. Cruza las tablas antes de que las ráfagas te hagan perder el equilibrio.",
        zone: "viento",
        x: 720,
        y: 280,
        difficulty: 3,
        color: "#e879f9",
        borderColor: "#86198f",
        neighbors: [4, 6],
        game: {
            type: "balance_run",
            goal: 6,
            itemIcon: "🪶",
            itemName: "Plumas del viento",
            timeLimit: 20,
            hazards: 5,
            hint: "Cruza y atrapa 6 plumas de viento esquivando las ráfagas cortantes."
        }
    },
    {
        id: 6,
        title: "Glaciar Helado",
        subtitle: "Alta Montaña",
        description: "Una extensión de hielo resbaladizo perpetuo. Avanza con precaución entre grietas y estalagmitas de hielo.",
        zone: "nieve",
        x: 410,
        y: 190,
        difficulty: 3,
        color: "#67e8f9",
        borderColor: "#155e75",
        neighbors: [4, 5, 7],
        game: {
            type: "ice_run",
            goal: 7,
            itemIcon: "❄️",
            itemName: "Témpanos rúnicos",
            timeLimit: 22,
            hazards: 5,
            hint: "Deslízate en el hielo y recoge 7 témpanos rúnicos esquivando las grietas."
        }
    },
    {
        id: 7,
        title: "Cumbre del Titán",
        subtitle: "Santuario de la Cima",
        description: "El punto más alto de la montaña sobre el mar de nubes. Enciende las 3 antorchas sagradas para consagrar tu hazaña.",
        zone: "cumbre",
        x: 530,
        y: 75,
        difficulty: 3,
        color: "#facc15",
        borderColor: "#854d0e",
        neighbors: [6],
        game: {
            type: "boss_altar",
            goal: 3,
            itemIcon: "🔥",
            itemName: "Llamas Sagradas",
            timeLimit: 25,
            hazards: 6,
            hint: "¡Esquiva los rayos de la tormenta y enciende las 3 llamas en el altar supremo!"
        }
    }
];

// Definición de las curvas de caminos entre niveles
const PATHS_DATA = [
    { from: 1, to: 2, cpx: 240, cpy: 520 },
    { from: 2, to: 3, cpx: 310, cpy: 400 },
    { from: 3, to: 4, cpx: 350, cpy: 320 },
    { from: 4, to: 5, cpx: 610, cpy: 360 },
    { from: 5, to: 6, cpx: 590, cpy: 220 },
    { from: 4, to: 6, cpx: 430, cpy: 270 }, // Camino alternativo/atajo escarpado
    { from: 6, to: 7, cpx: 460, cpy: 120 }
];

window.LEVELS_DATA = LEVELS_DATA;
window.PATHS_DATA = PATHS_DATA;
