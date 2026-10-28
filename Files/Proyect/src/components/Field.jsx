import React, { useId } from 'react';

/** Campo de formulario con <label> asociado al control mediante id (accesibilidad). */
const Field = ({ label, children, style }) => {
  const id = useId();
  return (
    <div className="form-group" style={style}>
      <label className="form-label" htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
};

export default Field;
