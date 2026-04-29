const SB_URL = process.env.SB_URL;
const SB_KEY = process.env.SB_KEY;

const HEADERS = {
  apikey: SB_KEY,
  Authorization: "Bearer " + SB_KEY,
  "Content-Type": "application/json",
  Prefer: "return=representation"
};

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== "POST") {
      return respuesta(405, { status: "error", mensaje: "Método no permitido" });
    }

    const body = JSON.parse(event.body);
    const action = body.action;
    const data = body.data || {};

    if (action === "validarLogin") return respuesta(200, await validarLogin(data));
    if (action === "obtenerDisponibilidad") return respuesta(200, await obtenerDisponibilidad(data.fecha));
    if (action === "reservar") return respuesta(200, await reservar(data));
    if (action === "consultaDepto") return respuesta(200, await consultaDepto(data.torre, data.depa));
    if (action === "validarDeptoAdmin") return respuesta(200, await validarDeptoAdmin(data.torre, data.depa));

    return respuesta(400, { status: "error", mensaje: "Acción no válida" });

  } catch (e) {
    return respuesta(500, { status: "error", mensaje: "Error sistema: " + e.message });
  }
};

function respuesta(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}

function fechaMexico() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function validarLogin({ user, pass, tor, dep }) {
  // VALIDACIÓN 1: datos completos de login
  if (!user || user.toString().trim() === "") {
    return {
      status: "error",
      mensaje: "Falta ingresar el usuario."
    };
  }

  if (!pass || pass.toString().trim() === "") {
    return {
      status: "error",
      mensaje: "Falta ingresar la contraseña."
    };
  }

  if (!tor || tor.toString().trim() === "") {
    return {
      status: "error",
      mensaje: "Falta seleccionar la torre."
    };
  }

  if (!dep || dep.toString().trim() === "") {
    return {
      status: "error",
      mensaje: "Falta ingresar el departamento."
    };
  }

  const userLimpio = user.toString().trim();
  const passLimpio = pass.toString().trim();
  const torreLimpia = tor.toString().trim();
  const depaLimpio = dep.toString().trim();

  // Buscar usuario y contraseña
  const url = `${SB_URL}/usuarios?usuario=eq.${encodeURIComponent(userLimpio)}&password=eq.${encodeURIComponent(passLimpio)}&select=*`;

  const res = await fetch(url, { headers: HEADERS });
  const usuarios = await res.json();

  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    return {
      status: "error",
      mensaje: "Usuario o contraseña incorrectos."
    };
  }

  // Validar torre y departamento del usuario
  const usuarioEncontrado = usuarios.find(u =>
    u.torre &&
    u.depa &&
    u.torre.toString().trim().toLowerCase() === torreLimpia.toLowerCase() &&
    parseFloat(u.depa) === parseFloat(depaLimpio)
  );

  if (!usuarioEncontrado) {
    return {
      status: "error",
      mensaje: "La torre o departamento no coinciden con este usuario."
    };
  }

  // VALIDACIÓN 2: bloqueo por adeudo
  const urlEstatus = `${SB_URL}/bd_estatus?torre=eq.${encodeURIComponent(torreLimpia)}&select=depa,estado`;

  const resEstatus = await fetch(urlEstatus, { headers: HEADERS });
  const dataEstatus = await resEstatus.json();

  const registroEstatus = dataEstatus.find(e =>
    parseFloat(e.depa) === parseFloat(depaLimpio)
  );

  if (!registroEstatus) {
    return {
      status: "error",
      mensaje: "Departamento no registrado en el sistema de estatus."
    };
  }

  const estado = registroEstatus.estado.toString().trim().toLowerCase();

  if (estado === "adeudo") {
    return {
      status: "error",
      mensaje: "Acceso denegado por falta de pago."
    };
  }

  return {
    status: "ok",
    ...usuarioEncontrado
  };
}

async function obtenerDisponibilidad(fecha) {
  const url = `${SB_URL}/res?fecha=eq.${fecha}&select=bloque`;
  const res = await fetch(url, { headers: HEADERS });
  const data = await res.json();

  let bloques = {
    A: { total: 0 },
    B: { total: 0 },
    C: { total: 0 },
    D: { total: 0 }
  };

  data.forEach(r => {
    if (r.bloque) {
      let letra = r.bloque.toString().trim().toUpperCase();
      if (bloques[letra]) bloques[letra].total++;
    }
  });

  return bloques;
}

async function reservar(datos) {
  const hoy = new Date();
  const hoyStr = fechaMexico();

 // VALIDACIÓN 12: no permitir guardar reservas incompletas
if (!datos.nombre || datos.nombre.toString().trim() === "") {
  return {
    status: "error",
    mensaje: "Falta el nombre del responsable."
  };
}

if (!datos.fecha || datos.fecha.toString().trim() === "") {
  return {
    status: "error",
    mensaje: "Falta seleccionar la fecha de reserva."
  };
}

if (!datos.bloque || datos.bloque.toString().trim() === "") {
  return {
    status: "error",
    mensaje: "Falta seleccionar el horario de reserva."
  };
}

if (!datos.torre || datos.torre.toString().trim() === "") {
  return {
    status: "error",
    mensaje: "Falta seleccionar la torre."
  };
}

if (!datos.depa || datos.depa.toString().trim() === "") {
  return {
    status: "error",
    mensaje: "Falta ingresar el departamento."
  };
}

if (!datos.personas || datos.personas.toString().trim() === "") {
  return {
    status: "error",
    mensaje: "Falta ingresar el número de personas."
  };
}

if (!datos.tipo || datos.tipo.toString().trim() === "") {
  return {
    status: "error",
    mensaje: "Falta seleccionar el tipo de reserva."
  };
}

  // Si hoy es sábado y quieren reservar domingo, no permitir
  const diaHoy = hoy.getDay();
  const fechaReservaTemp = new Date(datos.fecha + "T00:00:00");
  const diaReserva = fechaReservaTemp.getDay();

  if (diaHoy === 6 && diaReserva === 0) {
    return {
      status: "error",
      mensaje: "No se puede reservar en fin de semana los sábados."
    };
  }

  // Nadie puede registrar fechas pasadas
if (datos.fecha < hoyStr) {
  return {
    status: "error",
    mensaje: "No se pueden registrar fechas pasadas."
  };
}

// VALIDACIÓN: no permitir reservar más de 20 días adelante
const fechaMaxima = new Date();
fechaMaxima.setDate(fechaMaxima.getDate() + 20);

const fechaMaximaStr = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(fechaMaxima);

if (datos.fecha > fechaMaximaStr) {
  return {
    status: "error",
    mensaje: "Solo se puede reservar con máximo 20 días de anticipación."
  };
}

  // Usuario normal no puede reservar hoy
  if (datos.fecha === hoyStr && datos.rol !== "admin") {
    return {
      status: "error",
      mensaje: "Solo puedes reservar a partir de mañana."
    };
  }

  // Validar personas
  let numPersonas = parseInt(datos.personas);
  if (isNaN(numPersonas) || numPersonas < 1) numPersonas = 1;
  if (numPersonas > 6) numPersonas = 6;

  // VALIDACIÓN 9: una reserva por día por departamento
  // Aplica para usuario normal y admin
  const torreLimpia = datos.torre.toString().trim();
  const depaLimpio = datos.depa.toString().trim();

  const urlCheck = `${SB_URL}/res?fecha=eq.${datos.fecha}&torre=eq.${encodeURIComponent(torreLimpia)}&depa=eq.${encodeURIComponent(depaLimpio)}&select=*`;

  const resCheck = await fetch(urlCheck, { headers: HEADERS });
  const reservasExistentes = await resCheck.json();

  if (reservasExistentes.length > 0) {
    return {
      status: "error",
      mensaje: "Ya existe una reserva para este departamento en este día."
    };
  }

  // Validar fin de semana o festivo
  const fechaReserva = new Date(datos.fecha + "T00:00:00");
  const diaSemana = fechaReserva.getDay();
  const esFinSemana = diaSemana === 0 || diaSemana === 6;

  const urlF = `${SB_URL}/dfestivos?fecha=eq.${datos.fecha}&select=*`;
  const resF = await fetch(urlF, { headers: HEADERS });
  const festivos = await resF.json();
  const esFestivo = festivos.length > 0;

  if (!esFinSemana && !esFestivo) {
    return {
      status: "error",
      mensaje: "Solo se permite reservar fines de semana o días festivos."
    };
  }

  // VALIDACIÓN 11: máximo 5 reservas por bloque
  const bloqueNormalizado = datos.bloque.trim().toUpperCase();

  const urlBloque = `${SB_URL}/res?fecha=eq.${datos.fecha}&bloque=eq.${bloqueNormalizado}&select=*`;

  const resBloque = await fetch(urlBloque, { headers: HEADERS });
  const reservasBloque = await resBloque.json();

  if (reservasBloque.length >= 5) {
    return {
      status: "error",
      mensaje: "Este horario ya no tiene lugares disponibles."
    };
  }

  // Guardar reserva
  const payload = {
    fecha: datos.fecha,
    bloque: bloqueNormalizado,
    nombre: datos.nombre,
    torre: torreLimpia,
    depa: depaLimpio,
    personas: numPersonas,
    tipo: datos.tipo
  };

  const guardar = await fetch(`${SB_URL}/res`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(payload)
  });

  if (!guardar.ok) {
    const errorText = await guardar.text();
    return {
      status: "error",
      mensaje: "Error DB: " + errorText
    };
  }

  return {
    status: "ok",
    mensaje: `Reserva guardada (${numPersonas} personas)`
  };
}

async function consultaDepto(torre, depa) {
  const hoyStr = fechaMexico();

  const urlE = `${SB_URL}/bd_estatus?torre=eq.${encodeURIComponent(torre)}&depa=eq.${encodeURIComponent(depa)}&select=estado`;
  const resE = await fetch(urlE, { headers: HEADERS });
  const estatusData = await resE.json();

  const estatus = estatusData.length > 0 ? estatusData[0].estado : "No registrado";

  const urlR = `${SB_URL}/res?torre=eq.${encodeURIComponent(torre)}&depa=eq.${encodeURIComponent(depa)}&order=fecha.asc`;
  const resR = await fetch(urlR, { headers: HEADERS });
  const reservasRaw = await resR.json();

  const horarios = {
    A: "09-13",
    B: "13-16",
    C: "16-19",
    D: "19-22"
  };

  const reservas = reservasRaw
    .filter(r => r.fecha >= hoyStr)
    .map(r => ({
      fecha: r.fecha,
      horario: horarios[r.bloque.trim().toUpperCase()] || "S/H",
      responsable: r.nombre,
      personas: r.personas
    }));

  return { estatus, reservas };
}

async function validarDeptoAdmin(torre, depa) {
  if (!torre || !depa) {
    return {
      status: "error",
      mensaje: "Falta torre o departamento."
    };
  }

  const torreLimpia = torre.toString().trim();
  const depaLimpio = depa.toString().trim();

  const url = `${SB_URL}/bd_estatus?torre=eq.${encodeURIComponent(torreLimpia)}&select=depa,estado`;

  const res = await fetch(url, { headers: HEADERS });
  const data = await res.json();

  const registro = data.find(e => {
    return parseFloat(e.depa) === parseFloat(depaLimpio);
  });

  if (!registro) {
    return {
      status: "error",
      mensaje: "Departamento no encontrado en el sistema de estatus 🧐"
    };
  }

  const estado = registro.estado.toString().trim().toLowerCase();

  if (estado === "adeudo") {
    return {
      status: "bloqueado",
      mensaje: "Este departamento tiene pagos pendientes 💸"
    };
  }

  return {
    status: "ok",
    mensaje: "¡Todo en orden! Listo para reservar ✨"
  };
}