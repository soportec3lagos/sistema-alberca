let currentUser = null;
let deptoValido = false;

async function api(action, data = {}) {
  const res = await fetch("/.netlify/functions/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data })
  });

  return await res.json();
}

function pantallaLogin() {
  currentUser = null;

  app.innerHTML = `
    <h2>🔐 Acceso</h2>

    <input id="usuario" placeholder="Usuario">
    <input id="password" type="password" placeholder="Contraseña">

    <select id="torre">
      <option value="" disabled selected hidden>Selecciona tu Torre</option>
      <option>Torre 9</option>
      <option>Torre 10</option>
      <option>Torre 11</option>
      <option>Torre 12</option>
    </select>

    <input id="depa" placeholder="Departamento">

    <button onclick="login()">Entrar 🚀</button>

    <p id="msg"></p>
  `;
}

async function login() {
  const res = await api("validarLogin", {
    user: usuario.value,
    pass: password.value,
    tor: torre.value,
    dep: depa.value
  });

  if (res.status === "ok") {
    currentUser = res;
    menu();
  } else {
    msg.innerText = "❌ " + res.mensaje;
  }
}

function menu() {
  let reservaBtn = "";
  let misBtn = "";
  let adminBtn = "";
  let consultaBtn = "";

  if (currentUser.rol !== "seguridad") {
    reservaBtn = `<button onclick='formReserva()'>🏊 Reservar</button>`;
    misBtn = `<button onclick='misReservas()'>📅 Mis reservas</button>`;
  }

  if (currentUser.rol === "admin") {
    adminBtn = `
      <button onclick="formReservaAdmin()">🛠 Reserva Admin</button>
    `;
  }

  if (currentUser.rol === "admin" || currentUser.rol === "seguridad") {
    consultaBtn = `<button onclick="consulta()">🔍 Consulta</button>`;
  }

  app.innerHTML = `
    <h2>👋 ${currentUser.nombre}</h2>
    ${reservaBtn}
    ${misBtn}
    ${consultaBtn}
    ${adminBtn}
    <button class="back" onclick="pantallaLogin()">Cerrar sesión</button>
  `;
}

async function misReservas() {
  app.innerHTML = `
    <h2>📅 Mis Reservas</h2>
    <div id="lista">⏳ Cargando...</div>
    <button class="back" onclick="menu()">⬅ Volver</button>
  `;

  const res = await api("consultaDepto", {
    torre: currentUser.torre,
    depa: currentUser.depa
  });

  let html = `<p><b>🏢 Estatus:</b> ${res.estatus}</p>`;

  if (!res.reservas || res.reservas.length === 0) {
    lista.innerHTML = html + "⚠️ No tienes reservas";
    return;
  }

  html += `
    <table>
      <tr>
        <th>Fecha</th>
        <th>Horario</th>
        <th>Personas</th>
        <th>Responsable</th>
      </tr>
  `;

  res.reservas.forEach(r => {
    html += `
      <tr>
        <td>${r.fecha}</td>
        <td>${r.horario}</td>
        <td>${r.personas}</td>
        <td>${r.responsable}</td>
      </tr>
    `;
  });

  html += "</table>";
  lista.innerHTML = html;
}

function formReserva() {
  app.innerHTML = `
    <h2>🏊 Reservar</h2>
    <input type="date" id="fecha" onchange="verDisponibilidad()">
    <div id="disponibilidad"></div>
    <select id="bloque"></select>

    <input type="number" id="personas" placeholder="Personas (Máx 6)" min="1" max="6">

    <select id="tipo">
      <option value="normal">Normal</option>
      <option value="airbnb">Airbnb</option>
    </select>

    <button onclick='guardar()'>Guardar</button>
    <button class="back" onclick="menu()">⬅ Volver</button>
    <p id="msg"></p>
  `;
}

async function verDisponibilidad() {
  const res = await api("obtenerDisponibilidad", {
    fecha: fecha.value
  });

  pintarDisponibilidad(res, disponibilidad, bloque);
}

function pintarDisponibilidad(data, divDestino, selectDestino) {
  let html = "";
  let opciones = "";

  const horarios = {
    A: "09:00 - 13:00 hrs",
    B: "13:00 - 16:00 hrs",
    C: "16:00 - 19:00 hrs",
    D: "19:00 - 22:00 hrs"
  };

  for (let b in data) {
    let disp = 5 - data[b].total;

    html += `
      <div style="margin:5px 0;">
        🟢 <b>Bloque ${b}</b> (${horarios[b]}) →
        <b>${disp} lugares disponibles</b>
      </div>
    `;

    if (disp > 0) {
      opciones += `<option value="${b}">Bloque ${b} (${horarios[b]})</option>`;
    }
  }

  divDestino.innerHTML = html;
  selectDestino.innerHTML = opciones;
}

async function guardar() {
  const res = await api("reservar", {
    nombre: currentUser.nombre,
    fecha: fecha.value,
    bloque: bloque.value,
    torre: currentUser.torre,
    depa: currentUser.depa,
    personas: Number(personas.value),
    tipo: tipo.value,
    rol: currentUser.rol
  });

  msg.innerText = res.status === "ok" ? "✅ " + res.mensaje : "❌ " + res.mensaje;
}

function formReservaAdmin() {
  deptoValido = false;

  app.innerHTML = `
    <h2>🛠 Reserva Admin</h2>

    <select id="torreAdmin" onchange="validarDeptoAdminFront()">
      <option value="" disabled selected hidden>Selecciona Torre</option>
      <option>Torre 9</option>
      <option>Torre 10</option>
      <option>Torre 11</option>
      <option>Torre 12</option>
    </select>

    <input id="depaAdmin" placeholder="Departamento" onkeyup="validarDeptoAdminFront()">

    <p id="validacionDepto" style="font-weight:bold;text-align:center;"></p>

    <input id="nombreAdmin" placeholder="Nombre del Responsable">
    <input type="date" id="fechaAdmin" onchange="verDisponibilidadAdmin()">

    <div id="disponibilidadAdmin"></div>

    <select id="bloqueAdmin">
      <option value="" disabled selected hidden>Selecciona Horario</option>
    </select>

    <input type="number" id="personasAdmin" placeholder="No. Personas (Máx 6)" min="1" max="6">

    <select id="tipoAdmin">
      <option value="normal">Normal</option>
      <option value="airbnb">Airbnb</option>
    </select>

    <button onclick='guardarAdmin()'>Guardar Reserva 🏊</button>
    <button class="back" onclick="menu()">⬅ Volver</button>

    <p id="msg"></p>
  `;
}

async function validarDeptoAdminFront() {
  if (!torreAdmin.value || !depaAdmin.value) return;

  validacionDepto.innerHTML = "Verificando... ⏳";

  const res = await api("validarDeptoAdmin", {
    torre: torreAdmin.value,
    depa: depaAdmin.value
  });

  if (res.status === "ok") {
    deptoValido = true;
    validacionDepto.innerHTML = "✅ " + res.mensaje;
  } else {
    deptoValido = false;
    validacionDepto.innerHTML = "❌ " + res.mensaje;
  }
}

async function verDisponibilidadAdmin() {
  const res = await api("obtenerDisponibilidad", {
    fecha: fechaAdmin.value
  });

  pintarDisponibilidad(res, disponibilidadAdmin, bloqueAdmin);
}

async function guardarAdmin() {
  if (!deptoValido) {
    msg.innerHTML = "❌ Departamento inválido";
    return;
  }

  const res = await api("reservar", {
    nombre: nombreAdmin.value,
    fecha: fechaAdmin.value,
    bloque: bloqueAdmin.value,
    torre: torreAdmin.value,
    depa: depaAdmin.value,
    personas: Number(personasAdmin.value),
    tipo: tipoAdmin.value,
    rol: currentUser.rol
  });

  msg.innerHTML = res.status === "ok"
    ? "✅ " + res.mensaje
    : "❌ " + res.mensaje;
}

function consulta() {
  app.innerHTML = `
    <h2>🔍 Consulta</h2>
    <select id="torreC">
      <option value="" disabled selected hidden>Torre a consultar</option>
      <option>Torre 9</option>
      <option>Torre 10</option>
      <option>Torre 11</option>
      <option>Torre 12</option>
    </select>

    <input id="depaC" placeholder="Depto">

    <button onclick="buscarConsulta()">Buscar</button>
    <button class="back" onclick="menu()">⬅ Volver</button>

    <div id="resultado"></div>
  `;
}

async function buscarConsulta() {
  resultado.innerHTML = "Cargando...";

  const res = await api("consultaDepto", {
    torre: torreC.value,
    depa: depaC.value
  });

  let html = `<p><b>Estatus:</b> ${res.estatus}</p>`;

  html += `
    <table>
      <tr>
        <th>Fecha</th>
        <th>Horario</th>
        <th>Resp</th>
        <th>Pers</th>
      </tr>
  `;

  if (res.reservas) {
    res.reservas.forEach(r => {
      html += `
        <tr>
          <td>${r.fecha}</td>
          <td>${r.horario}</td>
          <td>${r.responsable}</td>
          <td>${r.personas}</td>
        </tr>
      `;
    });
  }

  html += "</table>";
  resultado.innerHTML = html;
}

pantallaLogin();