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
  const dx = x - centerX;
  const dy = y - centerY;

  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
};

const createOrUpdateClickableDiv = (x, y, id, className = "") => {
  let div = document.getElementById(id);

  if (!div) {
    div = document.createElement("div");
    div.id = id;
    div.className = `w-3 h-3 rounded-full cursor-pointer clickable-point ${className}`;
    document.body.appendChild(div);
  }

  // Update position
  div.style.position = "absolute";
  div.style.left = `${x - 6}px`; // Adjust for size
  div.style.top = `${y - 6}px`; // Adjust for size
};

const calculateRotationHandle = (cornerPoint, centerX, centerY, distance) => {
  const angle = Math.atan2(cornerPoint.y - centerY, cornerPoint.x - centerX);
  return {
    x: cornerPoint.x + Math.cos(angle) * distance,
    y: cornerPoint.y + Math.sin(angle) * distance,
  };
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
  const [strokeColorInput, setStrokeColorInput] = useState(false);

  const toggleColorInput = () => {
    setStrokeColorInput((prevState) => !prevState); // Correctly toggle the state
  };

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

        // Apply an offset for the rotation handles (distance outside the rectangle)
        const rotateHandleDistance = 30; // Larger distance for rotation handles to stay outside
        const rotateTopLeft = calculateRotationHandle(
          topLeft,
          centerX,
          centerY,
          rotateHandleDistance
        );
        const rotateTopRight = calculateRotationHandle(
          topRight,
          centerX,
          centerY,
          rotateHandleDistance
        );
        const rotateBottomLeft = calculateRotationHandle(
          bottomLeft,
          centerX,
          centerY,
          rotateHandleDistance
        );
        const rotateBottomRight = calculateRotationHandle(
          bottomRight,
          centerX,
          centerY,
          rotateHandleDistance
        );

        // === DRAWING VISIBLE HANDLES ===

        // Draw 4 resize handles at the corners using the same names used in the logic
        createOrUpdateClickableDiv(topLeft.x, topLeft.y, "tl", "bg-blue-500");
        createOrUpdateClickableDiv(topRight.x, topRight.y, "tr", "bg-blue-500");
        createOrUpdateClickableDiv(
          bottomLeft.x,
          bottomLeft.y,
          "bl",
          "bg-blue-500"
        );
        createOrUpdateClickableDiv(
          bottomRight.x,
          bottomRight.y,
          "br",
          "bg-blue-500"
        );

        // Draw 4 rotation handles further outside the corners
        createOrUpdateClickableDiv(
          rotateTopLeft.x,
          rotateTopLeft.y,
          "rotate-tl",
          "bg-red-500"
        );
        createOrUpdateClickableDiv(
          rotateTopRight.x,
          rotateTopRight.y,
          "rotate-tr",
          "bg-red-500"
        );
        createOrUpdateClickableDiv(
          rotateBottomLeft.x,
          rotateBottomLeft.y,
          "rotate-bl",
          "bg-red-500"
        );
        createOrUpdateClickableDiv(
          rotateBottomRight.x,
          rotateBottomRight.y,
          "rotate-br",
          "bg-red-500"
        );

        // === RESIZING & ROTATION LOGIC ===

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
        const nearRotateTopLeft = nearPoint(
          x,
          y,
          rotateTopLeft.x,
          rotateTopLeft.y,
          "rotate-tl"
        );
        const nearRotateTopRight = nearPoint(
          x,
          y,
          rotateTopRight.x,
          rotateTopRight.y,
          "rotate-tr"
        );
        const nearRotateBottomLeft = nearPoint(
          x,
          y,
          rotateBottomLeft.x,
          rotateBottomLeft.y,
          "rotate-bl"
        );
        const nearRotateBottomRight = nearPoint(
          x,
          y,
          rotateBottomRight.x,
          rotateBottomRight.y,
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
          nearRotateTopLeft ||
          nearRotateTopRight ||
          nearRotateBottomLeft ||
          nearRotateBottomRight ||
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

      // Ensure all necessary parameters are available
      if (!clientX || !clientY || !position || !coordinates) {
        console.error("Missing necessary parameters for resizing.");
        return;
      }

      // Pass rotation to the resizedCoordinates function
      const resizedCoords = resizedCoordinates(
        clientX,
        clientY,
        position,
        coordinates,
        rotation
      );

      // Check if resizedCoords is valid
      if (!resizedCoords) {
        console.error("Failed to calculate resized coordinates.");
        return; // Early exit to avoid further issues
      }

      const { x1, y1, x2, y2 } = resizedCoords;

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
      <div className="mt-2 fixed top-0 left-1/2 z-20 transform -translate-x-1/2 px-4 h-16 bg-[#0E1011] flex items-center justify-center gap-2 rounded-2xl">
        {/*
        
        //SELECTION BUTTON//
        
        */}
        <button
          id="selection"
          className={`w-[40px] h-[40px] rounded-[7px] flex items-center justify-center ${
            tool === "selection"
              ? "bg-[#33BBFF] hover:bg-[#22AAFF] text-white"
              : "bg-gray-300"
          } hover:bg-[#33BBFF]`}
          onClick={() => setTool("selection")}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g clip-path="url(#clip0_17_544)">
              <path
                d="M19.3419 10.1011C18.9946 10.3011 18.703 10.5851 18.494 10.9271C18.2399 10.6975 17.9397 10.5247 17.6135 10.4204C17.2872 10.3162 16.9425 10.2827 16.6023 10.3223C16.2622 10.362 15.9344 10.4738 15.6408 10.6502C15.3473 10.8267 15.0949 11.0638 14.9003 11.3457L13.5812 9.06085C13.2621 8.50817 12.7365 8.10489 12.1201 7.93972C11.5037 7.77454 10.8469 7.86101 10.2942 8.1801C9.74152 8.49919 9.33824 9.02476 9.17307 9.64119C9.0079 10.2576 9.09437 10.9144 9.41345 11.4671L12.851 17.421L12.3033 17.1289C12.0291 16.9715 11.7266 16.8697 11.4131 16.8292C11.0996 16.7887 10.7811 16.8103 10.476 16.8929C9.85969 17.0596 9.33488 17.4644 9.017 18.0181C8.69912 18.5718 8.61421 19.2291 8.78095 19.8453C8.94769 20.4616 9.35243 20.9865 9.90612 21.3043L10.6073 21.7162C15.7747 24.7522 17.9135 26.0091 21.4077 23.9917C23.1429 22.9872 24.4089 21.3355 24.9278 19.3988C25.4467 17.4621 25.1763 15.3987 24.1757 13.6611L22.6289 10.9819C22.3098 10.4292 21.7842 10.0259 21.1678 9.86075C20.5514 9.69558 19.8946 9.78205 19.3419 10.1011ZM22.985 14.3486C23.8036 15.7702 24.0249 17.4585 23.6004 19.0431C23.1758 20.6277 22.14 21.9791 20.7202 22.8009C17.9196 24.4178 16.3863 23.5169 11.3034 20.5294L10.599 20.1154L10.5969 20.1117C10.36 19.9752 10.1871 19.7503 10.116 19.4863C10.045 19.2224 10.0816 18.941 10.2178 18.7041C10.3081 18.5472 10.4385 18.4171 10.5956 18.3272C10.7525 18.2363 10.9305 18.1884 11.1118 18.1883C11.2931 18.1881 11.4712 18.2358 11.6282 18.3264C11.6347 18.3307 11.6415 18.3344 11.6485 18.3375L14.3271 19.768C14.4589 19.8379 14.6098 19.8631 14.7571 19.8396C14.9045 19.8162 15.0402 19.7455 15.1438 19.6382C15.2474 19.5309 15.3133 19.3928 15.3315 19.2447C15.3498 19.0966 15.3194 18.9467 15.2449 18.8174L10.6042 10.7796C10.4675 10.5427 10.4304 10.2613 10.5012 9.99707C10.572 9.73288 10.7448 9.50764 10.9817 9.37089C11.2186 9.23413 11.5 9.19708 11.7642 9.26786C12.0284 9.33865 12.2537 9.51149 12.3904 9.74835L15.3123 14.8092C15.4035 14.9671 15.5536 15.0823 15.7297 15.1295C15.9059 15.1767 16.0935 15.152 16.2514 15.0608C16.4093 14.9697 16.5246 14.8195 16.5718 14.6434C16.619 14.4673 16.5942 14.2796 16.5031 14.1217L15.9875 13.2286C15.8507 12.9917 15.8136 12.7102 15.8844 12.4461C15.9552 12.1819 16.1281 11.9566 16.3649 11.8199C16.6018 11.6831 16.8833 11.6461 17.1474 11.7169C17.4116 11.7877 17.6369 11.9605 17.7736 12.1973L18.633 13.6858C18.7242 13.8437 18.8743 13.959 19.0505 14.0062C19.2266 14.0533 19.4142 14.0286 19.5721 13.9375C19.7301 13.8463 19.8453 13.6961 19.8925 13.52C19.9397 13.3439 19.915 13.1562 19.8238 12.9983L19.6519 12.7006C19.5152 12.4638 19.4781 12.1823 19.5489 11.9181C19.6197 11.6539 19.7925 11.4287 20.0294 11.2919C20.2662 11.1552 20.5477 11.1181 20.8119 11.1889C21.0761 11.2597 21.3013 11.4325 21.4381 11.6694L22.985 14.3486Z"
                fill="#090A0B"
              />
            </g>
            <defs>
              <clipPath id="clip0_17_544">
                <rect
                  width="22"
                  height="22"
                  fill="white"
                  transform="translate(0.973633 11.9737) rotate(-30)"
                />
              </clipPath>
            </defs>
          </svg>
        </button>
        {/*
        
        /Pencil/
        
        */}
        <button
          id="pencil"
          className={`w-[40px] h-[40px] rounded-[7px] flex items-center justify-center ${
            tool === "pencil"
              ? "bg-[#33BBFF] hover:bg-[#22AAFF] text-white"
              : "bg-gray-300"
          } hover:bg-[#33BBFF]`}
          onClick={() => setTool("pencil")}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M21.3125 7.96467C21.313 7.78403 21.2777 7.60509 21.2085 7.43823C21.1393 7.27137 21.0377 7.11993 20.9094 6.99271L15.0072 1.08967C14.8796 0.961954 14.728 0.860644 14.5611 0.791524C14.3943 0.722404 14.2154 0.686829 14.0349 0.686829C13.8543 0.686829 13.6754 0.722404 13.5086 0.791524C13.3417 0.860644 13.1902 0.961954 13.0625 1.08967L10.6193 3.53287L5.63489 5.40373C5.40836 5.48821 5.208 5.63072 5.05386 5.81698C4.89973 6.00324 4.79722 6.22673 4.75661 6.46506L2.75942 18.449C2.74294 18.5476 2.74813 18.6485 2.77461 18.7448C2.80109 18.8411 2.84824 18.9305 2.91278 19.0067C2.97731 19.0829 3.05768 19.1442 3.1483 19.1862C3.23891 19.2282 3.33759 19.25 3.43747 19.25C3.47547 19.2498 3.5134 19.2467 3.55091 19.2405L15.534 17.2433C15.7721 17.2036 15.9955 17.1019 16.1818 16.9485C16.3681 16.7951 16.5107 16.5954 16.5954 16.3694L18.4662 11.385L20.9094 8.93748C21.0377 8.81013 21.1394 8.65855 21.2086 8.49154C21.2778 8.32453 21.3131 8.14544 21.3125 7.96467ZM15.308 15.8872L5.44153 17.5312L9.51239 13.4604C10.0208 13.7352 10.6112 13.8178 11.1756 13.6931C11.7399 13.5684 12.2405 13.2448 12.5859 12.7813C12.9312 12.3179 13.0982 11.7457 13.0564 11.1692C13.0145 10.5928 12.7666 10.0507 12.3579 9.64202C11.9493 9.23335 11.4071 8.98542 10.8307 8.94356C10.2543 8.90171 9.68203 9.06873 9.2186 9.41409C8.75518 9.75944 8.43154 10.2601 8.30686 10.8244C8.18218 11.3887 8.26479 11.9791 8.53958 12.4876L4.46872 16.5601L6.1127 6.69107L10.8281 4.92334L17.0758 11.1719L15.308 15.8872ZM9.62497 11.3437C9.62497 11.1398 9.68545 10.9404 9.79877 10.7708C9.91208 10.6012 10.0731 10.469 10.2616 10.391C10.45 10.3129 10.6574 10.2925 10.8574 10.3323C11.0575 10.3721 11.2412 10.4703 11.3854 10.6145C11.5296 10.7587 11.6279 10.9425 11.6677 11.1425C11.7074 11.3426 11.687 11.5499 11.609 11.7384C11.5309 11.9268 11.3987 12.0879 11.2292 12.2012C11.0596 12.3145 10.8602 12.375 10.6562 12.375C10.3827 12.375 10.1204 12.2663 9.92702 12.0729C9.73362 11.8795 9.62497 11.6172 9.62497 11.3437ZM17.875 10.0272L11.9719 4.12498L14.0344 2.06248L19.9375 7.96467L17.875 10.0272Z"
              fill="white"
            />
          </svg>
        </button>
        {/*
        
        //Line//
        
        */}
        <button
          id="line"
          className={`w-[40px] h-[40px] rounded-[7px] flex items-center justify-center ${
            tool === "line"
              ? "bg-[#33BBFF] hover:bg-[#22AAFF] text-white"
              : "bg-gray-300"
          } hover:bg-[#33BBFF]`}
          onClick={() => setTool("line")}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M18.4457 3.55436C17.9726 3.07991 17.3425 2.79451 16.6738 2.75176C16.0052 2.70901 15.3439 2.91186 14.8142 3.3222C14.2845 3.73255 13.9229 4.32215 13.7972 4.98029C13.6715 5.63843 13.7904 6.31981 14.1316 6.89647L6.89654 14.1316C6.37099 13.8226 5.75781 13.6967 5.15304 13.7735C4.54826 13.8503 3.98604 14.1255 3.55443 14.5561C3.19086 14.9199 2.93659 15.3783 2.82049 15.8793C2.7044 16.3804 2.73113 16.9039 2.89765 17.3905C3.06418 17.8771 3.36382 18.3073 3.76255 18.6321C4.16128 18.9569 4.64312 19.1635 5.15333 19.2282C5.66355 19.293 6.18169 19.2133 6.64892 18.9984C7.11615 18.7834 7.51373 18.4417 7.79652 18.0121C8.0793 17.5825 8.23595 17.0823 8.24867 16.5681C8.26139 16.054 8.12968 15.5466 7.86849 15.1035L15.1036 7.86843C15.6802 8.20961 16.3616 8.32852 17.0198 8.20283C17.6779 8.07714 18.2675 7.7155 18.6778 7.18582C19.0882 6.65614 19.291 5.99487 19.2483 5.3262C19.2055 4.65753 18.9201 4.02748 18.4457 3.55436ZM6.47201 17.4762C6.214 17.7342 5.86407 17.8792 5.49919 17.8792C5.13432 17.8792 4.78439 17.7342 4.52638 17.4762C4.26838 17.2182 4.12343 16.8683 4.12343 16.5034C4.12343 16.1385 4.26838 15.7886 4.52638 15.5306C4.65407 15.4029 4.80566 15.3016 4.9725 15.2325C5.13935 15.1633 5.31817 15.1278 5.49876 15.1278C5.67936 15.1278 5.85818 15.1633 6.02503 15.2325C6.19187 15.3016 6.34346 15.4029 6.47115 15.5306C6.72867 15.7883 6.8734 16.1377 6.87356 16.502C6.87372 16.8663 6.7293 17.2157 6.47201 17.4737V17.4762ZM17.472 6.47624C17.2797 6.6685 17.0347 6.79943 16.768 6.85246C16.5013 6.90549 16.2248 6.87824 15.9736 6.77416C15.7224 6.67008 15.5076 6.49384 15.3566 6.26773C15.2055 6.04162 15.1248 5.77579 15.1248 5.50385C15.1248 5.23192 15.2055 4.96609 15.3566 4.73998C15.5076 4.51387 15.7224 4.33763 15.9736 4.23355C16.2248 4.12947 16.5013 4.10222 16.768 4.15525C17.0347 4.20828 17.2797 4.33921 17.472 4.53147C17.7286 4.7889 17.8728 5.13746 17.8731 5.50092C17.8735 5.86439 17.7299 6.2132 17.4737 6.47108L17.472 6.47624Z"
              fill="white"
            />
          </svg>
        </button>

        <button
          id="rectangle"
          className={`w-[40px] h-[40px] rounded-[7px] flex items-center justify-center ${
            tool === "rectangle"
              ? "bg-[#33BBFF] hover:bg-[#22AAFF] text-white"
              : "bg-gray-300"
          } hover:bg-[#33BBFF]`}
          onClick={() => setTool("rectangle")}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M17.875 2.75H4.125C3.76033 2.75 3.41059 2.89487 3.15273 3.15273C2.89487 3.41059 2.75 3.76033 2.75 4.125V17.875C2.75 18.2397 2.89487 18.5894 3.15273 18.8473C3.41059 19.1051 3.76033 19.25 4.125 19.25H17.875C18.2397 19.25 18.5894 19.1051 18.8473 18.8473C19.1051 18.5894 19.25 18.2397 19.25 17.875V4.125C19.25 3.76033 19.1051 3.41059 18.8473 3.15273C18.5894 2.89487 18.2397 2.75 17.875 2.75ZM17.875 17.875H4.125V4.125H17.875V17.875Z"
              fill="white"
            />
          </svg>
        </button>

        <button
          id="drag"
          className={`w-[40px] h-[40px] rounded-[7px] flex items-center justify-center ${
            tool === "drag"
              ? "bg-[#33BBFF] hover:bg-[#22AAFF] text-white"
              : "bg-gray-300"
          } hover:bg-[#33BBFF]`}
          onClick={() => setTool("drag")}
        >
          <img
            width="30"
            height="30"
            src="https://img.icons8.com/external-outline-black-m-oki-orlando/32/external-panning-photography-outline-outline-black-m-oki-orlando.png"
            alt="external-panning-photography-outline-outline-black-m-oki-orlando"
          />
        </button>

        <button
          id="ellipse"
          className={`w-[40px] h-[40px] rounded-[7px] flex items-center justify-center ${
            tool === "ellipse"
              ? "bg-[#33BBFF] hover:bg-[#22AAFF] text-white"
              : "bg-gray-300"
          } hover:bg-[#33BBFF]`}
          onClick={() => setTool("ellipse")}
        >
          <img
            width="25"
            height="25"
            src="https://img.icons8.com/ios/50/circled.png"
            alt="circled"
          />
        </button>

        <button
          id="text"
          className={`w-[40px] h-[40px] rounded-[7px] flex items-center justify-center ${
            tool === "ellipse"
              ? "bg-[#33BBFF] hover:bg-[#22AAFF] text-white"
              : "bg-gray-300"
          } hover:bg-[#33BBFF]`}
          onClick={() => setTool("text")}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="0.5"
              y="0.5"
              width="39"
              height="39"
              rx="6.5"
              stroke="white"
              stroke-opacity="0.05"
            />
            <path
              d="M26.875 13.8125V16.5625C26.875 16.7448 26.8026 16.9197 26.6736 17.0486C26.5447 17.1776 26.3698 17.25 26.1875 17.25C26.0052 17.25 25.8303 17.1776 25.7014 17.0486C25.5724 16.9197 25.5 16.7448 25.5 16.5625V14.5H20.6875V25.5H22.75C22.9323 25.5 23.1072 25.5724 23.2361 25.7014C23.3651 25.8303 23.4375 26.0052 23.4375 26.1875C23.4375 26.3698 23.3651 26.5447 23.2361 26.6736C23.1072 26.8026 22.9323 26.875 22.75 26.875H17.25C17.0677 26.875 16.8928 26.8026 16.7639 26.6736C16.6349 26.5447 16.5625 26.3698 16.5625 26.1875C16.5625 26.0052 16.6349 25.8303 16.7639 25.7014C16.8928 25.5724 17.0677 25.5 17.25 25.5H19.3125V14.5H14.5V16.5625C14.5 16.7448 14.4276 16.9197 14.2986 17.0486C14.1697 17.1776 13.9948 17.25 13.8125 17.25C13.6302 17.25 13.4553 17.1776 13.3264 17.0486C13.1974 16.9197 13.125 16.7448 13.125 16.5625V13.8125C13.125 13.6302 13.1974 13.4553 13.3264 13.3264C13.4553 13.1974 13.6302 13.125 13.8125 13.125H26.1875C26.3698 13.125 26.5447 13.1974 26.6736 13.3264C26.8026 13.4553 26.875 13.6302 26.875 13.8125Z"
              fill="white"
            />
          </svg>
        </button>
        <input
          id="strokeColor"
          className={`w-[40px] h-[40px] rounded-[7px] flex items-center justify-center`}
          onClick={toggleColorInput} // Call the function here
          type="color"
          onChange={(e) => setStrokeColor(e.target.value)}
        >
        </input>
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
