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
  const url = `${SB_URL}/usuarios?usuario=eq.${encodeURIComponent(user.trim())}&password=eq.${encodeURIComponent(pass.trim())}&select=*`;

  const res = await fetch(url, { headers: HEADERS });
  const usuarios = await res.json();

  if (usuarios.length === 0) {
    return { status: "error", mensaje: "Usuario o contraseña incorrectos" };
  }

  const usuarioEncontrado = usuarios.find(u =>
    u.torre.toString().trim().toLowerCase() === tor.toString().trim().toLowerCase() &&
    parseFloat(u.depa) === parseFloat(dep)
  );

  if (!usuarioEncontrado) {
    return { status: "error", mensaje: "La Torre o Depto no coinciden con este usuario" };
  }

  const urlEstatus = `${SB_URL}/bd_estatus?torre=eq.${encodeURIComponent(tor.trim())}&select=depa,estado`;
  const resEstatus = await fetch(urlEstatus, { headers: HEADERS });
  const dataEstatus = await resEstatus.json();

  const registroEstatus = dataEstatus.find(e => parseFloat(e.depa) === parseFloat(dep));

  if (!registroEstatus) {
    return { status: "error", mensaje: "Departamento no registrado en el sistema de estatus" };
  }

  if (registroEstatus.estado.toLowerCase() === "adeudo") {
    return { status: "error", mensaje: "Acceso denegado por falta de pago" };
  }

  return { status: "ok", ...usuarioEncontrado };
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

  const diaHoy = hoy.getDay();

  const fechaReservaTemp = new Date(datos.fecha + "T00:00:00");
  const diaReserva = fechaReservaTemp.getDay();

  if (diaHoy === 6 && diaReserva === 0) {
    return {
      status: "error",
      mensaje: "No se puede reservar en fin de semana los sábados."
    };
  }

  if (datos.fecha < hoyStr) {
    return {
      status: "error",
      mensaje: "No se pueden registrar fechas pasadas."
    };
  }

  if (datos.fecha === hoyStr && datos.rol !== "admin") {
    return {
      status: "error",
      mensaje: "Solo puedes reservar a partir de mañana."
    };
  }

  let numPersonas = parseInt(datos.personas);
  if (isNaN(numPersonas) || numPersonas < 1) numPersonas = 1;
  if (numPersonas > 6) numPersonas = 6;

  if (datos.rol !== "admin") {
    const urlCheck = `${SB_URL}/res?fecha=eq.${datos.fecha}&torre=eq.${encodeURIComponent(datos.torre)}&depa=eq.${encodeURIComponent(datos.depa)}&select=*`;
    const resCheck = await fetch(urlCheck, { headers: HEADERS });
    const existe = await resCheck.json();

    if (existe.length > 0) {
      return { status: "error", mensaje: "Ya tienes una reserva para este día." };
    }
  }

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

  const payload = {
    fecha: datos.fecha,
    bloque: datos.bloque.trim().toUpperCase(),
    nombre: datos.nombre,
    torre: datos.torre,
    depa: datos.depa.toString(),
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
    return { status: "error", mensaje: "Error DB: " + errorText };
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
  const url = `${SB_URL}/bd_estatus?torre=eq.${encodeURIComponent(torre)}&depa=eq.${encodeURIComponent(depa)}&select=estado`;

  const res = await fetch(url, { headers: HEADERS });
  const data = await res.json();

  if (data.length === 0) {
    return {
      status: "error",
      mensaje: "Departamento no encontrado en el sistema de estatus 🧐"
    };
  }

  const estado = data[0].estado.toLowerCase();

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