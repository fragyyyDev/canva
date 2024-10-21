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
    case "ellipse":
    case "line":
    case "rectangle":
      let roughElement;
      if (type === "line") {
        roughElement = generator.line(x1, y1, x2, y2);
      } else if (type === "rectangle") {
        roughElement = generator.rectangle(x1, y1, x2 - x1, y2 - y1);
      } else if (type === "ellipse") {
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        roughElement = generator.ellipse(centerX, centerY, width, height);
      }

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
        rotation, // Include rotation if needed for all shapes
      };
    case "pencil":
      return { id, type, points: [{ x: x1, y: y1 }], strokeWidth, strokeColor };
    default:
      throw new Error(`Type not recognised: ${type}`);
  }
};

const rotatePoint = (x, y, centerX, centerY, angle) => {
  const radians = (Math.PI / 180) * angle;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const nx = cos * (x - centerX) - sin * (y - centerY) + centerX;
  const ny = sin * (x - centerX) + cos * (y - centerY) + centerY;
  return { x: nx, y: ny };
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

// Function to check if a point is inside a rotated rectangle
const pointInRotatedRectangle = (
  px,
  py,
  topLeft,
  topRight,
  bottomRight,
  bottomLeft
) => {
  // Use the cross product to determine if the point is inside the quadrilateral
  const isPointInTriangle = (p, v1, v2, v3) => {
    const sign = (p1, p2, p3) =>
      (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    const d1 = sign(p, v1, v2);
    const d2 = sign(p, v2, v3);
    const d3 = sign(p, v3, v1);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };

  const point = { x: px, y: py };
  // Check if the point is inside either of the two triangles making up the rectangle
  return (
    isPointInTriangle(point, topLeft, topRight, bottomRight) ||
    isPointInTriangle(point, topLeft, bottomRight, bottomLeft)
  );
};

const distance = (a, b) =>
  Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

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
  const centerX = (x1 + x2) / 2;
  const centerY = (y1 + y2) / 2;

  // Rotate the client coordinates back to the original axis-aligned coordinates
  const { x: rotatedClientX, y: rotatedClientY } = rotatePoint(
    clientX,
    clientY,
    centerX,
    centerY,
    -rotation
  );

  let newX1 = x1,
    newY1 = y1,
    newX2 = x2,
    newY2 = y2;

  switch (position) {
    case "tl":
    case "start":
      newX1 = rotatedClientX;
      newY1 = rotatedClientY;
      break;
    case "tr":
      newX2 = rotatedClientX;
      newY1 = rotatedClientY;
      break;
    case "bl":
      newX1 = rotatedClientX;
      newY2 = rotatedClientY;
      break;
    case "br":
    case "end":
      newX2 = rotatedClientX;
      newY2 = rotatedClientY;
      break;
    default:
      return null;
  }

  // Rotate the updated corners back to the rotated coordinate space
  const newTopLeft = rotatePoint(newX1, newY1, centerX, centerY, rotation);
  const newBottomRight = rotatePoint(newX2, newY2, centerX, centerY, rotation);

  return {
    x1: newTopLeft.x,
    y1: newTopLeft.y,
    x2: newBottomRight.x,
    y2: newBottomRight.y,
  };
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

  const positionWithinElement = (x, y, element) => {
    const { type, x1, x2, y1, y2, rotation = 0 } = element;

    switch (type) {
      case "line":
        const on = onLine(x1, y1, x2, y2, x, y);
        const start = nearPoint(x, y, x1, y1, "start");
        const end = nearPoint(x, y, x2, y2, "end");
        return start || end || on;

      case "rectangle":
        // Calculate the center of the rectangle
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;

        // Rotate each corner point
        const topLeft = rotatePoint(x1, y1, centerX, centerY, rotation);
        const topRight = rotatePoint(x2, y1, centerX, centerY, rotation);
        const bottomLeft = rotatePoint(x1, y2, centerX, centerY, rotation);
        const bottomRight = rotatePoint(x2, y2, centerX, centerY, rotation);

        // Check if the point is near any of the corners (resize handles)
        const nearTopLeft = nearPoint(x, y, topLeft.x, topLeft.y, "tl");
        const nearTopRight = nearPoint(x, y, topRight.x, topRight.y, "tr");
        const nearBottomLeft = nearPoint(
          x,
          y,
          bottomLeft.x,
          bottomLeft.y,
          "bl"
        );
        const nearBottomRight = nearPoint(
          x,
          y,
          bottomRight.x,
          bottomRight.y,
          "br"
        );

        // Check if the point is near any of the rotation handles
        const rotateTopLeft = nearPoint(
          x,
          y,
          topLeft.x - 5,
          topLeft.y - 5,
          "rotate-tl"
        );
        const rotateTopRight = nearPoint(
          x,
          y,
          topRight.x + 5,
          topRight.y - 5,
          "rotate-tr"
        );
        const rotateBottomLeft = nearPoint(
          x,
          y,
          bottomLeft.x - 5,
          bottomLeft.y + 5,
          "rotate-bl"
        );
        const rotateBottomRight = nearPoint(
          x,
          y,
          bottomRight.x + 5,
          bottomRight.y + 5,
          "rotate-br"
        );

        // Check if the point is inside the rotated rectangle
        const inside = pointInRotatedRectangle(
          x,
          y,
          topLeft,
          topRight,
          bottomRight,
          bottomLeft
        )
          ? "inside"
          : null;

        // Return the closest matching position
        return (
          nearTopLeft ||
          nearTopRight ||
          nearBottomLeft ||
          nearBottomRight ||
          rotateTopLeft ||
          rotateTopRight ||
          rotateBottomLeft ||
          rotateBottomRight ||
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

      case "ellipse":
        // Calculate the center of the ellipse
        const ellipseCenterX = (x1 + x2) / 2;
        const ellipseCenterY = (y1 + y2) / 2;

        // Calculate the radii
        const radiusX = Math.abs(x2 - x1) / 2;
        const radiusY = Math.abs(y2 - y1) / 2;

        // Rotate the point around the center
        const rotatedPoint = rotatePoint(
          x,
          y,
          ellipseCenterX,
          ellipseCenterY,
          -rotation
        );

        // Check if the point is inside the ellipse
        const normalizedX = (rotatedPoint.x - ellipseCenterX) / radiusX;
        const normalizedY = (rotatedPoint.y - ellipseCenterY) / radiusY;
        const isInsideEllipse =
          normalizedX * normalizedX + normalizedY * normalizedY <= 1;

        // Calculate the bounding box for the ellipse
        const boundingBoxLeft = ellipseCenterX - radiusX;
        const boundingBoxRight = ellipseCenterX + radiusX;
        const boundingBoxTop = ellipseCenterY - radiusY;
        const boundingBoxBottom = ellipseCenterY + radiusY;

        // Check if the point is near the bounding box corners (resize handles)
        const nearTopLeftCorner = nearPoint(
          x,
          y,
          boundingBoxLeft,
          boundingBoxTop,
          "tl"
        );
        const nearTopRightCorner = nearPoint(
          x,
          y,
          boundingBoxRight,
          boundingBoxTop,
          "tr"
        );
        const nearBottomLeftCorner = nearPoint(
          x,
          y,
          boundingBoxLeft,
          boundingBoxBottom,
          "bl"
        );
        const nearBottomRightCorner = nearPoint(
          x,
          y,
          boundingBoxRight,
          boundingBoxBottom,
          "br"
        );

        // Return the closest matching position
        return (
          nearTopLeftCorner ||
          nearTopRightCorner ||
          nearBottomLeftCorner ||
          nearBottomRightCorner ||
          (isInsideEllipse ? "inside" : null)
        );
      default:
        throw new Error(`Type not recognized: ${type}`);
    }
  };

  const getElementAtPosition = (x, y, elements) => {
    return elements
      .map((element) => ({
        ...element,
        position: positionWithinElement(x, y, element),
      }))
      .find((element) => element.position !== null);
  };

  const drawElement = (roughCanvas, context, element) => {
    context.save();

    if (element.rotation) {
      // Translate to the center of the element
      console.log("the element has rotation");
      const centerX = (element.x1 + element.x2) / 2;
      const centerY = (element.y1 + element.y2) / 2;
      context.translate(centerX, centerY);
      context.rotate((element.rotation * Math.PI) / 180); // Rotate the context
      context.translate(-centerX, -centerY); // Translate back
    }

    switch (element.type) {
      case "ellipse":
      case "line":
      case "rectangle":
        roughCanvas.draw(element.roughElement);
        break;
      case "pencil":
        const stroke = getSvgPathFromStroke(
          getStroke(element.points, { size: element.strokeWidth })
        );
        const path = new Path2D(stroke);

        context.fillStyle = element.strokeColor; // Set fill color to the same as stroke color
        context.strokeStyle = element.strokeColor; // Set stroke color
        context.lineWidth = element.strokeWidth; // Set line width

        context.fill(path); // Fill the path with the stroke color
        context.stroke(path); // Stroke the path

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
      case "ellipse":
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

    // Handle cursor style for selection tool
    if (tool === "selection") {
      const element = getElementAtPosition(clientX, clientY, elements);
      event.target.style.cursor = element
        ? cursorForPosition(element.position)
        : "default";
    }

    // Handle dragging for panning or element movement
    else if (tool === "drag" && isDragging) {
      const dx = clientX - startX;
      const dy = clientY - startY;

      setOffsetX((prevOffsetX) => prevOffsetX + dx);
      setOffsetY((prevOffsetY) => prevOffsetY + dy);

      setStartX(clientX);
      setStartY(clientY);
      return;
    }

    // Handle rotation
    if (action === "rotating" && selectedElement) {
      const { x1, y1, x2, y2, rotation } = selectedElement;
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;

      // Calculate angle between center and current mouse position
      const angle =
        Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI) +
        rotation;

      // Update rotation in the selected element
      const elementsCopy = [...elements];
      elementsCopy[selectedElement.id].rotation = angle;
      setElements(elementsCopy, true);
      return;
    }

    // Existing drawing and resizing logic
    if (action === "drawing") {
      const index = elements.length - 1;
      const { x1, y1 } = elements[index];
      updateElement(index, x1, y1, clientX, clientY, tool);
    } else if (action === "moving") {
      if (selectedElement.type === "pencil") {
        // Moving pencil element
        const newPoints = selectedElement.points.map((_, index) => ({
          x: clientX - selectedElement.xOffsets[index],
          y: clientY - selectedElement.yOffsets[index],
        }));
        const elementsCopy = [...elements];
        elementsCopy[selectedElement.id] = {
          ...elementsCopy[selectedElement.id],
          points: newPoints,
        };
        setElements(elementsCopy, true);
      } else {
        // Moving other elements (e.g., rectangles, lines)
        const { id, x1, y1, x2, y2, type, offsetX, offsetY, rotation } =
          selectedElement;
        const width = x2 - x1;
        const height = y2 - y1;
        const newX1 = clientX - offsetX;
        const newY1 = clientY - offsetY;
        const options = type === "text" ? { text: selectedElement.text } : {};
        updateElement(
          id,
          newX1,
          newY1,
          newX1 + width,
          newY1 + height,
          type,
          strokeColor,
          rotation
        );
      }
    } else if (action === "resizing") {
      // Resizing logic
      const { id, type, position, rotation, ...coordinates } = selectedElement;

      // Pass rotation to the resizedCoordinates function
      const { x1, y1, x2, y2 } = resizedCoordinates(
        clientX,
        clientY,
        position,
        coordinates,
        rotation
      );

      // Update the element with the new coordinates and rotation
      updateElement(
        id,
        x1,
        y1,
        x2,
        y2,
        type,
        strokeColor,
        rotation // Ensure rotation is passed to updateElement
      );
    }
  };

  const handleMouseUp = () => {
    if (selectedElement) {
      const index = selectedElement.id;
      const { id, type, rotation } = elements[index]; // Include rotation here
      if (
        (action === "drawing" || action === "resizing") &&
        adjustmentRequired(type)
      ) {
        const { x1, y1, x2, y2 } = adjustElementCoordinates(elements[index]);
        updateElement(id, x1, y1, x2, y2, type, strokeColor, rotation); // Pass rotation
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

        <button
          id="ellipse"
          className={`px-4 py-2 rounded-2xl ${
            tool === "ellipse"
              ? "bg-blue-500 hover:bg-blue-500 text-white"
              : "bg-gray-300"
          } hover:bg-blue-300`}
          onClick={() => setTool("ellipse")}
        >
          Ellipse
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

      <div className="fixed bottom-0 p-6 flex gap-4 z-40">
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
