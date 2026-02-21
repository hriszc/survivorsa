import { clamp, normalize } from "./utils";

export function createInputController({ canvas, elements }) {
  const keys = new Set();
  const pointer = { x: 0, y: 0 };
  const joystick = {
    active: false,
    pointerId: -1,
    centerX: 70,
    centerY: 70,
    stickX: 0,
    stickY: 0,
  };

  const isLikelyMobile =
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;

  const joystickArea = elements.joystickArea;
  const joystickStick = elements.joystickStick;

  function setStickVisual(x, y) {
    joystickStick.style.transform = `translate(${x}px, ${y}px)`;
  }

  function resetStick() {
    joystick.stickX = 0;
    joystick.stickY = 0;
    setStickVisual(0, 0);
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    keys.add(key);
  }

  function onKeyUp(event) {
    const key = event.key.toLowerCase();
    keys.delete(key);
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = clamp(event.clientX - rect.left, 0, rect.width);
    pointer.y = clamp(event.clientY - rect.top, 0, rect.height);

    if (!joystick.active || event.pointerId !== joystick.pointerId) {
      return;
    }

    const areaRect = joystickArea.getBoundingClientRect();
    const localX = event.clientX - areaRect.left - joystick.centerX;
    const localY = event.clientY - areaRect.top - joystick.centerY;
    const maxRadius = 48;
    const n = normalize(localX, localY);
    const magnitude = Math.min(maxRadius, n.len);
    joystick.stickX = n.x * magnitude;
    joystick.stickY = n.y * magnitude;
    setStickVisual(joystick.stickX, joystick.stickY);
  }

  function onJoystickPointerDown(event) {
    event.preventDefault();
    joystick.active = true;
    joystick.pointerId = event.pointerId;
    joystickArea.setPointerCapture(event.pointerId);
    onPointerMove(event);
  }

  function onJoystickPointerUp(event) {
    if (!joystick.active || event.pointerId !== joystick.pointerId) {
      return;
    }
    joystick.active = false;
    joystick.pointerId = -1;
    resetStick();
    joystickArea.releasePointerCapture(event.pointerId);
  }

  function update(run) {
    const left = keys.has("a") || keys.has("arrowleft");
    const right = keys.has("d") || keys.has("arrowright");
    const up = keys.has("w") || keys.has("arrowup");
    const down = keys.has("s") || keys.has("arrowdown");

    let moveX = Number(right) - Number(left);
    let moveY = Number(down) - Number(up);

    if (isLikelyMobile) {
      const mobileX = joystick.stickX / 48;
      const mobileY = joystick.stickY / 48;
      if (Math.abs(mobileX) > 0.04 || Math.abs(mobileY) > 0.04) {
        moveX = mobileX;
        moveY = mobileY;
      }
    }

    const normalized = normalize(moveX, moveY);
    run.input.moveX = normalized.x;
    run.input.moveY = normalized.y;
    run.input.pointerX = pointer.x;
    run.input.pointerY = pointer.y;
    run.input.isMobile = isLikelyMobile;

    if (keys.has(" ")) {
      run.input.wantDash = true;
    }

    if (keys.has("escape")) {
      run.input.wantPause = true;
      keys.delete("escape");
    }

    if (keys.has("enter")) {
      run.input.wantConfirm = true;
      keys.delete("enter");
    }

    if (keys.has("1")) {
      run.input.levelupChoice = 0;
      keys.delete("1");
    } else if (keys.has("2")) {
      run.input.levelupChoice = 1;
      keys.delete("2");
    } else if (keys.has("3")) {
      run.input.levelupChoice = 2;
      keys.delete("3");
    }

    if (keys.has("f")) {
      run.input.toggleFullscreen = true;
      keys.delete("f");
    }
  }

  function destroy() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointermove", onPointerMove);
    joystickArea.removeEventListener("pointerdown", onJoystickPointerDown);
    joystickArea.removeEventListener("pointerup", onJoystickPointerUp);
    joystickArea.removeEventListener("pointercancel", onJoystickPointerUp);
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  joystickArea.addEventListener("pointerdown", onJoystickPointerDown);
  joystickArea.addEventListener("pointerup", onJoystickPointerUp);
  joystickArea.addEventListener("pointercancel", onJoystickPointerUp);

  return {
    update,
    destroy,
  };
}
