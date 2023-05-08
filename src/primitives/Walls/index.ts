import * as THREE from "three";
// import { Vector3 } from "three";
import { Primitive } from "../Primitive";
import { OffsetFaces } from "../OffsetFaces";
import { Extrusions } from "../Extrusions";
import { Vector } from "../../utils";

export class Walls extends Primitive {
  /** {@link Primitive.mesh } */
  mesh: THREE.Mesh;

  offsetFaces = new OffsetFaces();
  extrusions = new Extrusions();

  list: {
    [id: number]: {
      id: number;
      extrusion: number;
    };
  } = {};

  knots: {
    [id: number]: {
      id: number;
      extrusion: number;
    };
  } = {};

  defaultAxis: number;

  constructor() {
    super();
    // TODO: Probably better to keep offsetfaces and extrusion faces separated
    this.extrusions.faces = this.offsetFaces.faces;
    this.mesh = this.extrusions.mesh;

    const heightPointsID = this.extrusions.lines.addPoints([
      [0, 0, 0],
      [0, 3, 0],
    ]);

    const [axisID] = this.extrusions.lines.add(heightPointsID);
    this.defaultAxis = axisID;
  }

  regenerate(ids = this.offsetFaces.ids) {
    for (const id of ids) {
      const extrusion = this.createGeometry(id);
      if (extrusion === null) continue;

      this.list[id] = {
        id,
        extrusion,
      };
    }
    const relatedKnots = this.offsetFaces.getRelatedKnots(ids);
    this.regenerateKnots(relatedKnots);
  }

  /**
   * Select or unselects the given Walls.
   * @param active Whether to select or unselect.
   * @param ids List of walls IDs to select or unselect. If not
   * defined, all lines walls be selected or deselected.
   */
  select(active: boolean, ids?: Iterable<number>) {
    const idsUndefined = ids === undefined;
    const items = idsUndefined ? this.ids : ids;
    this.selected.select(active, items, this.ids);
    const extrusions: number[] = [];
    for (const id of this.selected.data) {
      const wall = this.list[id];
      if (!wall) continue;
      extrusions.push(wall.extrusion);
    }
    const selected = idsUndefined ? undefined : extrusions;
    this.extrusions.select(active, selected);

    this.offsetFaces.select(active, items);
  }

  /**
   * Applies a transformation to the selected geometries.
   * @param matrix Transformation matrix to apply.
   */
  transform(matrix: THREE.Matrix4) {
    this.offsetFaces.transform(matrix);

    const relatedPoints = new Set<number>();
    for (const id of this.offsetFaces.lines.vertices.selected.data) {
      relatedPoints.add(id);
    }

    const updatedLines = this.offsetFaces.getRelatedLines(relatedPoints, true);

    // const updatedKnots = this.offsetFaces.getRelatedKnots(updatedLines);
    // this.regenerateKnots(updatedKnots);

    for (const id of updatedLines) {
      const offsetFace = this.offsetFaces.list[id];
      const extrusionID = this.list[id].extrusion;
      const { baseFace, topFace } = this.extrusions.list[extrusionID];

      const faces = this.extrusions.faces;
      const [p1, p1Top, p4Top, p4] = faces.list[baseFace].points;
      const [p2, p2Top, p3Top, p3] = faces.list[topFace].points;

      const [bp1, bp2, bp3, bp4] = offsetFace.points;

      const p1Coords = this.offsetFaces.faces.points[bp1].coordinates;
      const p2Coords = this.offsetFaces.faces.points[bp2].coordinates;
      const p3Coords = this.offsetFaces.faces.points[bp3].coordinates;
      const p4Coords = this.offsetFaces.faces.points[bp4].coordinates;

      // Set coordinates of base

      this.extrusions.faces.setPoint(p1, p1Coords);
      this.extrusions.faces.setPoint(p2, p2Coords);
      this.extrusions.faces.setPoint(p3, p3Coords);
      this.extrusions.faces.setPoint(p4, p4Coords);

      // Set coordinates of top

      const axis = this.getVerticalAxis();
      const p1TopCoords = Vector.add(p1Coords, axis);
      const p2TopCoords = Vector.add(p2Coords, axis);
      const p3TopCoords = Vector.add(p3Coords, axis);
      const p4TopCoords = Vector.add(p4Coords, axis);

      this.extrusions.faces.setPoint(p1Top, p1TopCoords);
      this.extrusions.faces.setPoint(p2Top, p2TopCoords);
      this.extrusions.faces.setPoint(p3Top, p3TopCoords);
      this.extrusions.faces.setPoint(p4Top, p4TopCoords);

      // Set coordinates of holes in wall
      //  ...
    }
  }

  private regenerateKnots(ids = this.offsetFaces.knotsIDs as Iterable<number>) {
    for (const knotID of ids) {
      const knot = this.offsetFaces.knots[knotID];
      if (knot === null || knot === undefined) continue;
      this.createKnotGeometry(knot);
    }
  }

  private createGeometry(offsetFaceID: number) {
    const offsetFace = this.offsetFaces.list[offsetFaceID];
    const [p1ID, p2ID, p3ID, p4ID] = offsetFace.points;

    const points = this.offsetFaces.faces.points;
    const p1 = points[p1ID].coordinates;
    const p4 = points[p4ID].coordinates;

    const vector = this.getVerticalAxis();

    const p1Top = Vector.add(p1, vector);
    const p4Top = Vector.add(p4, vector);

    const direction = Vector.subtract(p1, p4);
    const normalDirection = Vector.normalize(direction);
    const normal = Vector.multiply(Vector.up, normalDirection);
    const scaledNormal = Vector.multiplyScalar(normal, offsetFace.width);
    const p1Normal = Vector.add(p1, scaledNormal);
    const normalAxisPointsIDs = this.extrusions.lines.addPoints([p1, p1Normal]);
    const [normalAxis] = this.extrusions.lines.add(normalAxisPointsIDs);

    const pointsIDs = this.extrusions.faces.addPoints([p1, p1Top, p4Top, p4]);
    const faceID = this.extrusions.faces.add(pointsIDs);
    const extrusionID = this.extrusions.add(faceID, normalAxis);

    // Correct extrusion top to fit the OffsetFace knots

    const extrusion = this.extrusions.list[extrusionID];
    const otherSide = this.extrusions.faces.list[extrusion.topFace];
    const otherSidePoints = Array.from(otherSide.points);

    const [extrP2, extrP2Top, extrP3Top, extrP3] = otherSidePoints;

    const p2 = points[p2ID].coordinates;
    const p3 = points[p3ID].coordinates;
    const p2Top = Vector.add(p2, vector);
    const p3Top = Vector.add(p3, vector);

    this.extrusions.faces.setPoint(extrP2, p2);
    this.extrusions.faces.setPoint(extrP3, p3);
    this.extrusions.faces.setPoint(extrP2Top, p2Top);
    this.extrusions.faces.setPoint(extrP3Top, p3Top);

    return extrusionID;
  }

  // TODO: Allow each wall to have a different vertical axis
  //  (e.g. for different heights or tilted walls)
  private getVerticalAxis() {
    const line = this.extrusions.lines.get(this.defaultAxis);
    if (!line) {
      throw new Error("Wall axis not found!");
    }
    const [start, end] = line;
    return Vector.subtract(start, end);
  }

  private createKnotGeometry(knotID: number) {
    if (this.knots[knotID]) {
      const knot = this.knots[knotID];
      this.extrusions.remove([knot.extrusion]);
    }

    const face = this.offsetFaces.faces.list[knotID];
    const points: [number, number, number][] = [];
    for (const pointID of face.points) {
      const point = this.offsetFaces.faces.points[pointID];
      points.push(point.coordinates);
    }

    const pointsIDs = this.extrusions.faces.addPoints(points);
    const faceID = this.extrusions.faces.add(pointsIDs);
    const extrusion = this.extrusions.add(faceID, this.defaultAxis);

    this.knots[knotID] = {
      id: knotID,
      extrusion,
    };
  }
}
