import './styles/pip-mascot.css';

// Original CSS character: separate pieces make depth, blinking and waving inexpensive.
export default function PipMascot({ greeting }) {
  return (
    <div className="pip-stage" data-greeting={greeting}>
      <div className="pip-shadow" />
      <div className="pip-float">
        <div className="robot-antenna">
          <i />
        </div>
        <div className="robot-head">
          <div className="robot-ear ear-left" />
          <div className="robot-ear ear-right" />
          <div className="robot-visor">
            <div className="robot-eyes">
              <span className="robot-eye">
                <i />
              </span>
              <span className="robot-eye">
                <i />
              </span>
            </div>
            <div className="robot-cheeks">
              <i />
              <i />
            </div>
            <div className="robot-mouth" />
            <span className="visor-glint" />
          </div>
          <span className="robot-serial">PIP / 01</span>
        </div>
        <div className="robot-body">
          <div className="robot-badge">
            <img src="/prism-mark.svg" width="34" height="34" alt="" />
          </div>
          <span className="robot-light" />
          <span className="robot-vent">≡</span>
        </div>
        <div className="robot-arm arm-left">
          <span />
        </div>
        <div className="robot-arm arm-right">
          <span />
        </div>
        <div className="robot-leg leg-left" />
        <div className="robot-leg leg-right" />
      </div>
    </div>
  );
}
