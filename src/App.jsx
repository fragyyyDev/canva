import React, { useEffect, useLayoutEffect, useState } from "react";
import rough from "roughjs/bundled/rough.esm";
import getStroke from "perfect-freehand";

const generator = rough.generator();

const createElement = (
  id,
  x1,
  y1,
  x2,
  y2,
  type,
  strokeWidth,
  strokeColor,
  rotation = 0
) => {
  switch (type) {
    case "line":
    case "rectangle":
      const roughElement =
        type === "line"
          ? generator.line(x1, y1, x2, y2)
          : generator.rectangle(x1, y1, x2 - x1, y2 - y1);
      return {
        id,
        x1,
        y1,
        x2,
        y2,
        type,
        roughElement,
        strokeWidth,
        strokeColor,
        rotation, // Add rotation property
      };
    case "pencil":
      return { id, type, points: [{ x: x1, y: y1 }], strokeWidth, strokeColor };
    default:
      throw new Error(`Type not recognised: ${type}`);
  }
};

const nearPoint = (x, y, x1, y1, name) => {
  return Math.abs(x - x1) < 5 && Math.abs(y - y1) < 5 ? name : null;
};

const onLine = (x1, y1, x2, y2, x, y, maxDistance = 1) => {
  const a = { x: x1, y: y1 };
  const b = { x: x2, y: y2 };
  const c = { x, y };
  const offset = distance(a, b) - (distance(a, c) + distance(b, c));
  return Math.abs(offset) < maxDistance ? "inside" : null;
};

const positionWithinElement = (x, y, element) => {
  const { type, x1, x2, y1, y2 } = element;
  switch (type) {
    case "line":
      const on = onLine(x1, y1, x2, y2, x, y);
      const start = nearPoint(x, y, x1, y1, "start");
      const end = nearPoint(x, y, x2, y2, "end");
      return start || end || on;
    case "rectangle":
      // Resize handles (same as before)
      const topLeft = nearPoint(x, y, x1, y1, "tl");
      const topRight = nearPoint(x, y, x2, y1, "tr");
      const bottomLeft = nearPoint(x, y, x1, y2, "bl");
      const bottomRight = nearPoint(x, y, x2, y2, "br");

      // Rotation handles placed slightly outside corners
      const rotateTopRight = nearPoint(x, y, x2 + 5, y1 - 5, "rotate-tr");
      const rotateBottomLeft = nearPoint(x, y, x1 - 5, y2 + 5, "rotate-bl");
      const rotateBottomRight = nearPoint(x, y, x2 + 5, y2 + 5, "rotate-br");
      const rotateTopLeft = nearPoint(x, y, x1 - 5, y1 - 5, "rotate-tl");

      const inside = x >= x1 && x <= x2 && y >= y1 && y <= y2 ? "inside" : null;
      return (
        topLeft ||
        topRight ||
        bottomLeft ||
        bottomRight ||
        rotateTopRight ||
        rotateBottomLeft ||
        rotateBottomRight ||
        rotateTopLeft ||
        inside
      );
    case "pencil":
      const betweenAnyPoint = element.points.some((point, index) => {
        const nextPoint = element.points[index + 1];
        if (!nextPoint) return false;
        return (
          onLine(point.x, point.y, nextPoint.x, nextPoint.y, x, y, 5) != null
        );
      });
      return betweenAnyPoint ? "inside" : null;
    default:
      throw new Error(`Type not recognised: ${type}`);
  }
};

const distance = (a, b) =>
  Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

const getElementAtPosition = (x, y, elements) => {
  return elements
    .map((element) => ({
      ...element,
      position: positionWithinElement(x, y, element),
    }))
    .find((element) => element.position !== null);
};

const adjustElementCoordinates = (element) => {
  const { type, x1, y1, x2, y2 } = element;
  if (type === "rectangle") {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return { x1: minX, y1: minY, x2: maxX, y2: maxY };
  } else {
    if (x1 < x2 || (x1 === x2 && y1 < y2)) {
      return { x1, y1, x2, y2 };
    } else {
      return { x1: x2, y1: y2, x2: x1, y2: y1 };
    }
  }
};

const cursorForPosition = (position) => {
  switch (position) {
    case "tl":
    case "br":
    case "start":
    case "end":
      return "nwse-resize";
    case "tr":
    case "bl":
      return "nesw-resize";
    case "rotate-tr":
    case "rotate-bl":
    case "rotate-br":
    case "rotate-tl":
      return "alias"; // Custom rotate cursor
    default:
      return "move";
  }
};
const resizedCoordinates = (
  clientX,
  clientY,
  position,
  coordinates,
  rotation = 0
) => {
  const { x1, y1, x2, y2 } = coordinates;

  // Create a function to rotate the point around the center
  const rotatePoint = (cx, cy, angle, x, y) => {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: cos * (x - cx) - sin * (y - cy) + cx,
      y: sin * (x - cx) + cos * (y - cy) + cy,
    };
  };

  // Get the center of the element
  const centerX = (x1 + x2) / 2;
  const centerY = (y1 + y2) / 2;

  switch (position) {
    case "tl":
    case "start":
      return { x1: clientX, y1: clientY, x2, y2 };
    case "tr":
      return { x1, y1: clientY, x2: clientX, y2 };
    case "bl":
      return { x1: clientX, y1, x2, y2: clientY };
    case "br":
    case "end":
      return { x1, y1, x2: clientX, y2: clientY };
    default:
      return null; //should not really get here...
  }
};

const useHistory = (initialState) => {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([initialState]);

  const setState = (action, overwrite = false) => {
    const newState =
      typeof action === "function" ? action(history[index]) : action;
    if (overwrite) {
      const historyCopy = [...history];
      historyCopy[index] = newState;
      setHistory(historyCopy);
    } else {
      const updatedState = [...history].slice(0, index + 1);
      setHistory([...updatedState, newState]);
      setIndex((prevState) => prevState + 1);
    }
  };

  const undo = () => index > 0 && setIndex((prevState) => prevState - 1);
  const redo = () =>
    index < history.length - 1 && setIndex((prevState) => prevState + 1);

  return [history[index], setState, undo, redo];
};

const getSvgPathFromStroke = (stroke) => {
  if (!stroke.length) return "";

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );

  d.push("Z");
  return d.join(" ");
};

const adjustmentRequired = (type) => ["line", "rectangle"].includes(type);

const App = () => {
  const [elements, setElements, undo, redo] = useHistory([]);
  const [action, setAction] = useState("none");
  const [tool, setTool] = useState("pencil");
  const [selectedElement, setSelectedElement] = useState(null);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeColor, setStrokeColor] = useState("#000000"); // Default to black
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [canvas, setCanvas] = useState(null);
  const [context, setContext] = useState(null);
  const [roughCanvas, setRoughCanvas] = useState(null);

  const drawElement = (roughCanvas, context, element) => {
    context.save();

    if (element.rotation) {
      // Translate to the center of the element
      const centerX = (element.x1 + element.x2) / 2;
      const centerY = (element.y1 + element.y2) / 2;
      context.translate(centerX, centerY);
      context.rotate((element.rotation * Math.PI) / 180); // Rotate the context
      context.translate(-centerX, -centerY); // Translate back
    }

    switch (element.type) {
      case "line":
      case "rectangle":
        roughCanvas.draw(element.roughElement);
        break;
      case "pencil":
        const stroke = getSvgPathFromStroke(
          getStroke(element.points, { size: element.strokeWidth })
        );
        context.fill(new Path2D(stroke));
        break;
      default:
        throw new Error(`Type not recognised: ${element.type}`);
    }

    context.restore();
  };

  const redrawCanvas = (roughCanvas, context) => {
    if (!canvas || !context) return; // Add guard to ensure canvas is available

    context.clearRect(0, 0, canvas.width, canvas.height);
    elements.forEach((element) => drawElement(roughCanvas, context, element));
  };

  useLayoutEffect(() => {
    const canvasElement = document.getElementById("canvas");

    if (canvasElement) {
      setCanvas(canvasElement);
      const context = canvasElement.getContext("2d");
      setContext(context);
      const roughCanvasInstance = rough.canvas(canvasElement);
      setRoughCanvas(roughCanvasInstance);

      // Ensure the canvas and context exist before calling redrawCanvas
      if (roughCanvasInstance && context) {
        redrawCanvas(roughCanvasInstance, context);
      }
      context.clearRect(0, 0, canvasElement.width, canvasElement.height);
      context.save();
    }
  }, [elements]); // Update when elements change
  useEffect(() => {
    const undoRedoFunction = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    document.addEventListener("keydown", undoRedoFunction);
    return () => {
      document.removeEventListener("keydown", undoRedoFunction);
    };
  }, [undo, redo]);

  const updateElement = (id, x1, y1, x2, y2, type, color, rotation) => {
    const elementsCopy = [...elements];

    switch (type) {
      case "line":
      case "rectangle":
        elementsCopy[id] = createElement(
          id,
          x1,
          y1,
          x2,
          y2,
          type,
          strokeWidth,
          color,
          rotation // Include rotation here
        );
        break;
      case "pencil":
        elementsCopy[id].points = [
          ...elementsCopy[id].points,
          { x: x2, y: y2 },
        ];
        break;
      default:
        throw new Error(`Type not recognised: ${type}`);
    }

    setElements(elementsCopy, true);
  };

  const getMouseCoordinates = (e) => {
    const canvasBounds = canvas.getBoundingClientRect(); // Get canvas boundaries
    const clientX = e.clientX - canvasBounds.left - offsetX; // Corrected clientX calculation with bounds and offset
    const clientY = e.clientY - canvasBounds.top - offsetY; // Corrected clientY calculation with bounds and offset
    return { clientX, clientY };
  };

  const handleMouseDown = (event) => {
    const { clientX, clientY } = getMouseCoordinates(event);

    // Dragging functionality
    if (tool === "drag") {
      setIsDragging(true);
      setStartX(clientX);
      setStartY(clientY);
      return;
    }

    // Selection, Moving, Resizing, and Rotating
    if (tool === "selection") {
      const element = getElementAtPosition(clientX, clientY, elements);

      if (element) {
        // Check for rotation handles
        if (element.position && element.position.startsWith("rotate")) {
          // Correctly identify rotation
          setSelectedElement(element);
          setAction("rotating");
        } else if (element.type === "pencil") {
          // Logic for moving pencil points
          const xOffsets = element.points.map((point) => clientX - point.x);
          const yOffsets = element.points.map((point) => clientY - point.y);
          setSelectedElement({ ...element, xOffsets, yOffsets });
          setAction("moving");
        } else {
          // Standard move/resize for other element types
          const offsetX = clientX - element.x1;
          const offsetY = clientY - element.y1;
          setSelectedElement({ ...element, offsetX, offsetY });

          if (element.position === "inside") {
            setAction("moving");
          } else {
            setAction("resizing"); // Ensure this is only triggered for resize handles
          }
        }

        // Update the elements state
        setElements((prevState) => prevState);
      }
    } else {
      // Drawing new element logic
      const id = elements.length;
      const element = createElement(
        id,
        clientX,
        clientY,
        clientX,
        clientY,
        tool,
        strokeWidth,
        strokeColor
      );
      setElements((prevState) => [...prevState, element]);
      setSelectedElement(element);
      setAction("drawing");
    }
  };

  const handleMouseMove = (event) => {
    const { clientX, clientY } = getMouseCoordinates(event);

    if (tool === "selection") {
      const element = getElementAtPosition(clientX, clientY, elements);
      event.target.style.cursor = element
        ? cursorForPosition(element.position)
        : "default";
    } else if (tool === "drag" && isDragging) {
      const dx = clientX - startX;
      const dy = clientY - startY;

      setOffsetX((prevOffsetX) => prevOffsetX + dx);
      setOffsetY((prevOffsetY) => prevOffsetY + dy);

      setStartX(clientX);
      setStartY(clientY);
      return;
    }

    // ROTATION HANDLING
    if (action === "rotating" && selectedElement) {
      const { x1, y1, x2, y2 } = selectedElement;

      // Get the center of the element
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;

      // Calculate the angle between the center and the mouse position
      const angle =
        Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);

      // Update the element's rotation property
      const elementsCopy = [...elements];
      elementsCopy[selectedElement.id].rotation = angle;
      setElements(elementsCopy, true);

      return;
    }

    // Existing move and resize logic
    if (action === "drawing") {
      const index = elements.length - 1;
      const { x1, y1 } = elements[index];
      updateElement(index, x1, y1, clientX, clientY, tool);
    } else if (action === "moving") {
      const { id, x1, x2, y1, y2, type, offsetX, offsetY, rotation } = selectedElement;
      const width = x2 - x1;
      const height = y2 - y1;
      const newX1 = clientX - offsetX;
      const newY1 = clientY - offsetY;
    
      // Adjust for rotation when moving
      updateElement(id, newX1, newY1, newX1 + width, newY1 + height, type, strokeColor, rotation); // Include rotation
    
    
    } else if (action === "resizing") {
      const { id, type, position, ...coordinates } = selectedElement;
      const { x1, y1, x2, y2 } = resizedCoordinates(
        clientX,
        clientY,
        position,
        coordinates,
        selectedElement.rotation
      );
      updateElement(id, x1, y1, x2, y2, type);
    }
  };

  const handleMouseUp = () => {
    if (selectedElement) {
      const index = selectedElement.id;
      const { id, type } = elements[index];
      if (
        (action === "drawing" || action === "resizing") &&
        adjustmentRequired(type)
      ) {
        const { x1, y1, x2, y2 } = adjustElementCoordinates(elements[index]);
        updateElement(id, x1, y1, x2, y2, type);
      }
    }

    // Stop dragging
    setIsDragging(false);
    setAction("none");
    setSelectedElement(null);
  };

  useEffect(() => {
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas before applying transformations
      context.save(); // Save the current context state

      context.setTransform(1, 0, 0, 1, 0, 0); // Reset transformations to the default
      context.translate(offsetX, offsetY); // Apply translation for dragging

      redrawCanvas(roughCanvas, context); // Redraw the elements with the correct transformations

      context.restore(); // Restore the context to its previous state
    }
  }, [offsetX, offsetY, elements, context, roughCanvas]);
  return (
    <div className="">
      <div className="mt-2 fixed top-0 left-1/2 z-20 transform -translate-x-1/2 w-[60%] h-16 bg-[#575757] flex items-center justify-center gap-6 rounded-2xl">
        <button
          id="selection"
          className={`px-4 py-2 rounded-2xl  ${
            tool === "selection"
              ? "bg-blue-500 hover:bg-blue-500 text-white"
              : "bg-gray-300"
          } hover:bg-blue-300`}
          onClick={() => setTool("selection")}
        >
          <img
            width="24"
            height="24"
            src="https://img.icons8.com/?size=100&id=83985&format=png&color=000000"
            alt="cursor"
          />{" "}
        </button>

        <button
          id="line"
          className={`px-4 py-2 rounded-2xl ${
            tool === "line"
              ? "bg-blue-500 hover:bg-blue-500 text-white"
              : "bg-gray-300"
          } hover:bg-blue-300`}
          onClick={() => setTool("line")}
        >
          Line
        </button>

        <button
          id="rectangle"
          className={`px-4 py-2 rounded-2xl ${
            tool === "rectangle"
              ? "bg-blue-500 hover:bg-blue-500 text-white"
              : "bg-gray-300"
          } hover:bg-blue-300`}
          onClick={() => setTool("rectangle")}
        >
          Rectangle
        </button>

        <button
          id="pencil"
          className={`px-4 py-2 rounded-2xl ${
            tool === "pencil"
              ? "bg-blue-500 hover:bg-blue-500 text-white"
              : "bg-gray-300"
          } hover:bg-blue-300`}
          onClick={() => setTool("pencil")}
        >
          Pencil
        </button>

        <button
          id="drag"
          className={`px-4 py-2 rounded-2xl ${
            tool === "drag"
              ? "bg-blue-500 hover:bg-blue-500 text-white"
              : "bg-gray-300"
          } hover:bg-blue-300`}
          onClick={() => setTool("drag")}
        >
          Drag
        </button>
      </div>

      {tool === "pencil" && (
        <div className="absolute top-20 z-20">
          <input
            type="range"
            min={1}
            max={20}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(e.target.valueAsNumber)}
          />
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
          />
        </div>
      )}

      <div className="fixed bottom-0 p-6 flex gap-4">
        <button
          onClick={undo}
          className="p-3 bg-[#575757] rounded-2xl text-white w-32"
        >
          Undo
        </button>
        <button
          onClick={redo}
          className="p-3 bg-[#575757] rounded-2xl text-white w-32"
        >
          Redo
        </button>
      </div>
      <canvas
        id="canvas"
        className="absolute z-10 min-w-screen min-h-screen"
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        Canvas
      </canvas>
    </div>
  );
};

export default App;
