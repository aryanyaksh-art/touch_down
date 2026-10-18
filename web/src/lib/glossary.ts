/** Plain-language explanations for the small (i) buttons in the landing views. Written for a reader who has never seen the project.
 *  Faithful means what the real OSIRIS-REx did; the extension is the neural detector this project adds. Figures come from docs/validation.md. */
export interface Term {
  title: string
  body: string
}

export const GLOSSARY = {
  hazardMap: {
    title: 'Hazard map',
    body: 'A map of the dangerous ground, meaning boulders and steep slopes. The ground team builds it before the landing and loads it onto the spacecraft. A complete map has every hazard in it. A stale map is missing the small boulders the team could not see, which tests what an out-of-date map does.',
  },
  baseline: {
    title: 'Baseline and detector',
    body: 'Baseline is how the real mission worked: back away at about 5 m if the predicted touch point is unsafe on the loaded map. The detector is this project’s extension and was not on the real spacecraft. A neural network looks for hazards in the camera images during the descent and adds them to the map.',
  },
  decision: {
    title: 'The decision',
    body: 'At about 5 m above the surface the spacecraft predicts where it will touch and estimates the chance that spot is a hazard. If that chance is above 1 percent it backs away. Otherwise it touches down.',
  },
  delivery: {
    title: 'Distance from the aim point',
    body: 'How far from the aim point the sampler head actually touched. The real mission landed within about 1 m. Across all 1,000 simulated landings the median is 0.39 m.',
  },
  groundUnder: {
    title: 'Ground under the contact point',
    body: 'Whether the spot that was actually touched is safe on the true terrain. Hazard means a rock at least 21 cm tall, or ground steeper than 14 degrees, within reach of the sampler head.',
  },
  baselineDecision: {
    title: 'Faithful baseline decision',
    body: 'What the mission-style logic decides on this flight: the complete hazard map and no detector.',
  },
  fourWays: {
    title: 'One flight, judged four ways',
    body: 'The spacecraft flew once. Each row replays only the 5 m decision with a different hazard map, complete or stale, with and without the detector. It shows when the detector would have changed the outcome.',
  },
  picture: {
    title: 'The picture',
    body: 'A view straight down from about 5 m, above the point where the spacecraft predicted it would touch. It is re-rendered for this landing from the terrain model, so it is close to what the camera saw but not the exact frame.',
  },
  cameraFrame: {
    title: 'Camera frame',
    body: 'What the spacecraft\u2019s navigation camera saw at this point in the descent, rendered from the terrain model. Move the slider under the pictures to watch the ground get closer.',
  },
  layers: {
    title: 'Layers',
    body: 'Raw is the plain picture. Ground truth marks the real hazards from the terrain model, with boulders in orange and steep ground in red. Detector shows what the neural network found. The slider wipes between the raw picture and the layer.',
  },
  map: {
    title: 'Site map',
    body: 'A top-down map of the landing site. The solid line is where the spacecraft really went and the dashed line is where it believed it was. The small ellipse around the dashed line is its uncertainty. The larger shaded oval at the end is the predicted touch point.',
  },
  hazardLabels: {
    title: 'Hazard labels',
    body: 'Colours the hazards on the camera frame, using the true labels or, when the detector is on, the labels the neural network found.',
  },
  landmarks: {
    title: 'Landmark matches',
    body: 'The spacecraft looks for known patches of ground in every image. A box is where it expected a patch to be and a dot is where the image shows it. The gap between them corrects its position estimate. This is Natural Feature Tracking, the method the real mission used.',
  },
  positionError: {
    title: 'Position error',
    body: 'How far the spacecraft’s own estimate of its position is from where it really is. The estimate comes from matching landmarks in the images. Smaller is better, and it reaches a few centimetres by the 5 m decision.',
  },
  matchpoint: {
    title: 'Matchpoint-style burn',
    body: 'A small thruster burn partway down that sets up the final straight fall toward the aim point at about 10 cm per second. The real mission made a burn like this at about 54 m.',
  },
  hazardProbability: {
    title: 'Hazard probability',
    body: 'The chance that the sampler head would touch a hazard at the predicted contact point, given how uncertain the position estimate is. Above 1 percent the spacecraft backs away.',
  },
  predictionError: {
    title: 'Prediction error',
    body: 'How far the actual touch point was from the point predicted at 5 m. The real mission’s was 3.5 cm. The median across the 1,000 simulated landings is 3.4 cm.',
  },
} satisfies Record<string, Term>

export type TermKey = keyof typeof GLOSSARY
